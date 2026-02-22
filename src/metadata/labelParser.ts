/**
 * AxLabelFile Parser
 * Parses D365FO .label.txt files from PackagesLocalDirectory
 * and indexes them into the SQLite labels table.
 *
 * Label file format (one per line):
 *   LabelId=Label text
 *    ;Optional comment line (leading space + semicolon)
 *
 * File locations on K: drive:
 *   {pkg}\{Model}\{Model}\AxLabelFile\LabelResources\{locale}\{LabelFileId}.{locale}.label.txt
 *   {pkg}\{Model}\{Model}\AxLabelFile\{LabelFileId}_{locale}.xml  (metadata descriptor)
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { XppSymbolIndex } from './symbolIndex.js';

export interface ParsedLabel {
  labelId: string;
  text: string;
  comment?: string;
  labelFileId: string;
  model: string;
  language: string;
  filePath: string;
}

/**
 * Parse a single .label.txt file into ParsedLabel records.
 */
export function parseLabelFile(
  content: string,
  labelFileId: string,
  model: string,
  language: string,
  filePath: string,
): ParsedLabel[] {
  const labels: ParsedLabel[] = [];
  // Normalise line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let current: ParsedLabel | null = null;

  for (const line of lines) {
    if (line === '') continue;

    if (line.startsWith(' ;') || line.startsWith('\t;')) {
      // Comment line for the previous label
      if (current) {
        const commentText = line.replace(/^[ \t];/, '').trim();
        current.comment = current.comment ? `${current.comment} ${commentText}` : commentText;
      }
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      // Flush previous label
      if (current) labels.push(current);

      const labelId = line.substring(0, eqIdx).trim();
      const text = line.substring(eqIdx + 1);

      // Skip empty or obviously malformed ids
      if (!labelId || /\s/.test(labelId)) {
        current = null;
        continue;
      }

      current = { labelId, text, comment: undefined, labelFileId, model, language, filePath };
    }
    // Any other line (continuation) — ignore; D365FO labels are single-line
  }

  if (current) labels.push(current);
  return labels;
}

/**
 * Discover all AxLabelFile resources for a model.
 * Returns an array of { labelFileId, language, filePath }.
 */
export async function discoverLabelFiles(
  modelDir: string,  // e.g. K:\AosService\PackagesLocalDirectory\AslCore\AslCore
): Promise<Array<{ labelFileId: string; language: string; filePath: string }>> {
  const results: Array<{ labelFileId: string; language: string; filePath: string }> = [];
  const axLabelDir = path.join(modelDir, 'AxLabelFile', 'LabelResources');
  
  // 🎯 OPTIMIZATION: Only index languages you actually use!
  // Reduces database from 20M rows to ~1M (20x smaller, 20x faster)
  // Configure via LABEL_LANGUAGES env var (default: en-US,cs,sk,de)
  const langConfig = process.env.LABEL_LANGUAGES || 'en-US,cs,sk,de';
  const SUPPORTED_LANGUAGES = langConfig.toLowerCase() === 'all'
    ? null  // null = index all languages
    : new Set(langConfig.split(',').map(l => l.trim()));

  let locales: string[];
  try {
    locales = await fs.readdir(axLabelDir);
  } catch {
    return results; // No AxLabelFile folder
  }

  for (const locale of locales) {
    // Skip unsupported languages early (unless SUPPORTED_LANGUAGES is null = all languages)
    if (SUPPORTED_LANGUAGES && !SUPPORTED_LANGUAGES.has(locale)) {
      continue;
    }
    
    const localeDir = path.join(axLabelDir, locale);
    let files: string[];
    try {
      files = await fs.readdir(localeDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.label.txt')) continue;
      // Filename pattern: {LabelFileId}.{locale}.label.txt
      // e.g. AslCore.en-US.label.txt
      const withoutSuffix = file.replace(/\.label\.txt$/, '');
      const dotIdx = withoutSuffix.lastIndexOf('.');
      if (dotIdx < 0) continue;
      const labelFileId = withoutSuffix.substring(0, dotIdx);
      const fileLang = withoutSuffix.substring(dotIdx + 1);

      // Sanity-check: locale from directory should match lang in filename
      if (fileLang !== locale) continue;

      results.push({
        labelFileId,
        language: locale,
        filePath: path.join(localeDir, file),
      });
    }
  }

  return results;
}

/**
 * Index all label files for a single model into the symbol index.
 * Returns the number of label entries inserted.
 *
 * Pass `{ skipFtsRebuild: true }` when calling in a loop over many models;
 * the caller is responsible for calling `symbolIndex.rebuildLabelsFts()` once
 * after all models have been indexed.
 */
export async function indexModelLabels(
  symbolIndex: XppSymbolIndex,
  modelDir: string,
  model: string,
  opts?: { skipFtsRebuild?: boolean },
): Promise<{ labelsIndexed: number; labelFilesDiscovered: number; labelFilesProcessed: number; durationMs: number }> {
  const modelStart = Date.now();
  const labelFiles = await discoverLabelFiles(modelDir);
  if (labelFiles.length === 0) {
    const durationMs = Date.now() - modelStart;
    return { labelsIndexed: 0, labelFilesDiscovered: 0, labelFilesProcessed: 0, durationMs };
  }

  const allEntries: Parameters<XppSymbolIndex['bulkAddLabels']>[0] = [];
  let labelFilesProcessed = 0;
  const useLiveProgress = process.stdout.isTTY && process.env.CI !== 'true';

  const renderFileProgress = (processed: number, total: number, labelsIndexed: number) => {
    const percent = ((processed / total) * 100).toFixed(0);
    const elapsed = ((Date.now() - modelStart) / 1000).toFixed(1);
    const msg = `   📄 [${model}] ${processed}/${total} files (${percent}%) - ${labelsIndexed} labels (${elapsed}s)`;

    if (useLiveProgress) {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(msg);
      return;
    }

    // Fallback for non-TTY logs: periodic checkpoints to avoid log spam
    if (processed === 1 || processed === total || processed % 50 === 0) {
      console.log(msg);
    }
  };

  for (const { labelFileId, language, filePath } of labelFiles) {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const labels = parseLabelFile(content, labelFileId, model, language, filePath);
    labelFilesProcessed++;
    for (const lbl of labels) {
      allEntries.push({
        labelId: lbl.labelId,
        labelFileId: lbl.labelFileId,
        model: lbl.model,
        language: lbl.language,
        text: lbl.text,
        comment: lbl.comment,
        filePath: lbl.filePath,
      });
    }

    renderFileProgress(labelFilesProcessed, labelFiles.length, allEntries.length);
  }

  if (useLiveProgress) {
    process.stdout.write('\n');
  }

  if (allEntries.length > 0) {
    symbolIndex.bulkAddLabels(allEntries, opts);
  }

  const durationMs = Date.now() - modelStart;

  return {
    labelsIndexed: allEntries.length,
    labelFilesDiscovered: labelFiles.length,
    labelFilesProcessed,
    durationMs,
  };
}

/**
 * Index ALL labels from PackagesLocalDirectory into the symbol index.
 * Scans all model folders.
 */
export async function indexAllLabels(
  symbolIndex: XppSymbolIndex,
  packagesPath: string,
  modelFilter?: (modelName: string) => boolean,
): Promise<{
  totalLabels: number;
  modelsIndexed: number;
  totalDurationMs: number;
  avgDurationPerModelMs: number;
  avgDurationPerLabelFileMs: number;
}> {
  const totalStart = Date.now();
  let totalLabels = 0;
  let modelsIndexed = 0;
  let modelsProcessed = 0;
  let totalModelDurationMs = 0;
  let totalLabelFilesProcessed = 0;

  let models: string[];
  try {
    const entries = fsSync.readdirSync(packagesPath, { withFileTypes: true });
    // Include both real directories AND symbolic links / junction points.
    // On Windows, D365FO PackagesLocalDirectory model folders are often NTFS
    // junction points, which readdirSync reports as isSymbolicLink()=true
    // rather than isDirectory()=true.
    models = entries.filter(e => e.isDirectory() || e.isSymbolicLink()).map(e => e.name);
  } catch {
    console.error(`[LabelParser] Cannot read packages path: ${packagesPath}`);
    return {
      totalLabels,
      modelsIndexed,
      totalDurationMs: 0,
      avgDurationPerModelMs: 0,
      avgDurationPerLabelFileMs: 0,
    };
  }

  const modelsToProcess = models.filter((model) => {
    if (modelFilter && !modelFilter(model)) return false;

    // The inner model source dir has the same name as the outer package dir
    const modelDir = path.join(packagesPath, model, model);
    return fsSync.existsSync(modelDir);
  });

  console.log(`   📄 Indexing ${modelsToProcess.length} model(s)...`);

  for (let modelIdx = 0; modelIdx < modelsToProcess.length; modelIdx++) {
    const model = modelsToProcess[modelIdx];
    const modelDir = path.join(packagesPath, model, model);

    // Skip per-model FTS rebuild; do a single rebuild after all models are indexed
    const modelStats = await indexModelLabels(symbolIndex, modelDir, model, { skipFtsRebuild: true });
    modelsProcessed++;
    totalModelDurationMs += modelStats.durationMs;
    totalLabelFilesProcessed += modelStats.labelFilesProcessed;

    if (modelStats.labelsIndexed > 0) {
      totalLabels += modelStats.labelsIndexed;
      modelsIndexed++;
    }

    const progressPercent = ((modelIdx + 1) / modelsToProcess.length * 100).toFixed(0);
    const modelDuration = (modelStats.durationMs / 1000).toFixed(1);
    const elapsed = ((Date.now() - totalStart) / 1000).toFixed(0);
    console.log(`   🏷️  [${progressPercent}%] ${model} - ${modelDuration}s (${elapsed}s total)`);
  }

  // Single FTS rebuild after all models — avoids O(N²) cost of rebuilding per model
  if (totalLabels > 0) {
    symbolIndex.rebuildLabelsFts();
  }

  const totalDurationMs = Date.now() - totalStart;
  const avgDurationPerModelMs = modelsProcessed > 0 ? totalModelDurationMs / modelsProcessed : 0;
  const avgDurationPerLabelFileMs = totalLabelFilesProcessed > 0 ? totalModelDurationMs / totalLabelFilesProcessed : 0;
  const duration = (totalDurationMs / 1000).toFixed(1);

  console.log(`   ✅ Indexed ${modelsProcessed} model(s) in ${duration}s`);
  console.log(`   📊 Labels indexed: ${totalLabels} across ${modelsIndexed} model(s)`);
  console.log(`   ⏱️  Averages: ${avgDurationPerModelMs.toFixed(1)}ms/model, ${avgDurationPerLabelFileMs.toFixed(1)}ms/label-file`);

  return { totalLabels, modelsIndexed, totalDurationMs, avgDurationPerModelMs, avgDurationPerLabelFileMs };
}
