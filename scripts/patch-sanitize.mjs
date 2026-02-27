// Patch script: add fixes 6, 7, 8 to sanitizeReportXml in createD365File.ts
import { readFileSync, writeFileSync } from 'fs';

const f = new URL('../src/tools/createD365File.ts', import.meta.url).pathname.slice(1);
let src = readFileSync(f, 'utf8');

// ── Guard: only run once ─────────────────────────────────────────────────────
if (src.includes('// 6. Ensure <Parameters>')) {
  console.log('Already patched — nothing to do');
  process.exit(0);
}

// ── New code to insert before "    return xml;" ──────────────────────────────
const newFixes = `
    // 6. Ensure <Parameters> block inside <AxReportDataSet> for real RDP datasets.
    //    Skipped for stub/minimal datasets that have no <DataSourceType>.
    if (xml.includes('<DataSourceType>') && !xml.includes('<Parameters>')) {
      const axDatasetParams =
        '\\t\\t\\t<Parameters>\\n' +
        '\\t\\t\\t\\t<AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t\\t<Name>AX_PartitionKey</Name>\\n' +
        '\\t\\t\\t\\t\\t<Alias>AX_PartitionKey</Alias>\\n' +
        '\\t\\t\\t\\t\\t<DataType>System.String</DataType>\\n' +
        '\\t\\t\\t\\t\\t<Parameter>AX_PartitionKey</Parameter>\\n' +
        '\\t\\t\\t\\t</AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t<AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t\\t<Name>AX_CompanyName</Name>\\n' +
        '\\t\\t\\t\\t\\t<Alias>AX_CompanyName</Alias>\\n' +
        '\\t\\t\\t\\t\\t<DataType>System.String</DataType>\\n' +
        '\\t\\t\\t\\t\\t<Parameter>AX_CompanyName</Parameter>\\n' +
        '\\t\\t\\t\\t</AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t<AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t\\t<Name>AX_UserContext</Name>\\n' +
        '\\t\\t\\t\\t\\t<Alias>AX_UserContext</Alias>\\n' +
        '\\t\\t\\t\\t\\t<DataType>System.String</DataType>\\n' +
        '\\t\\t\\t\\t\\t<Parameter>AX_UserContext</Parameter>\\n' +
        '\\t\\t\\t\\t</AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t<AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t\\t<Name>AX_RenderingCulture</Name>\\n' +
        '\\t\\t\\t\\t\\t<Alias>AX_RenderingCulture</Alias>\\n' +
        '\\t\\t\\t\\t\\t<DataType>System.String</DataType>\\n' +
        '\\t\\t\\t\\t\\t<Parameter>AX_RenderingCulture</Parameter>\\n' +
        '\\t\\t\\t\\t</AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t<AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t\\t<Name>AX_ReportContext</Name>\\n' +
        '\\t\\t\\t\\t\\t<Alias>AX_ReportContext</Alias>\\n' +
        '\\t\\t\\t\\t\\t<DataType>System.String</DataType>\\n' +
        '\\t\\t\\t\\t\\t<Parameter>AX_ReportContext</Parameter>\\n' +
        '\\t\\t\\t\\t</AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t<AxReportDataSetParameter>\\n' +
        '\\t\\t\\t\\t\\t<Name>AX_RdpPreProcessedId</Name>\\n' +
        '\\t\\t\\t\\t\\t<Alias>AX_RdpPreProcessedId</Alias>\\n' +
        '\\t\\t\\t\\t\\t<DataType>System.String</DataType>\\n' +
        '\\t\\t\\t\\t\\t<Parameter>AX_RdpPreProcessedId</Parameter>\\n' +
        '\\t\\t\\t\\t</AxReportDataSetParameter>\\n' +
        '\\t\\t\\t</Parameters>';
      if (xml.includes('</Fields>')) {
        xml = xml.replace('</Fields>', \`</Fields>\n\${axDatasetParams}\`);
      } else if (xml.includes('<Fields />')) {
        xml = xml.replace('<Fields />', \`<Fields />\n\${axDatasetParams}\`);
      } else {
        xml = xml.replace('</AxReportDataSet>', \`\${axDatasetParams}\n\\t\\t</AxReportDataSet>\`);
      }
      console.error('[sanitizeReportXml] Added missing <Parameters> to <AxReportDataSet>');
    }

    // 7. Ensure <DefaultParameterGroup> before <Designs> for real RDP datasets.
    if (xml.includes('<DataSourceType>') && !xml.includes('<DefaultParameterGroup>') && xml.includes('<Designs>')) {
      const defaultParamGroup =
        '\\t<DefaultParameterGroup>\\n' +
        '\\t\\t<Name xmlns="">Parameters</Name>\\n' +
        '\\t\\t<ReportParameterBases xmlns="">\\n' +
        '\\t\\t\\t<AxReportParameterBase xmlns=""\\n' +
        '\\t\\t\\t\\t\\ti:type="AxReportParameter">\\n' +
        '\\t\\t\\t\\t<Name>AX_PartitionKey</Name>\\n' +
        '\\t\\t\\t\\t<AllowBlank>true</AllowBlank>\\n' +
        '\\t\\t\\t\\t<Nullable>true</Nullable>\\n' +
        '\\t\\t\\t\\t<UserVisibility>Hidden</UserVisibility>\\n' +
        '\\t\\t\\t\\t<DefaultValue />\\n' +
        '\\t\\t\\t\\t<Values />\\n' +
        '\\t\\t\\t</AxReportParameterBase>\\n' +
        '\\t\\t\\t<AxReportParameterBase xmlns=""\\n' +
        '\\t\\t\\t\\t\\ti:type="AxReportParameter">\\n' +
        '\\t\\t\\t\\t<Name>AX_CompanyName</Name>\\n' +
        '\\t\\t\\t\\t<UserVisibility>Hidden</UserVisibility>\\n' +
        '\\t\\t\\t\\t<DefaultValue />\\n' +
        '\\t\\t\\t\\t<Values />\\n' +
        '\\t\\t\\t</AxReportParameterBase>\\n' +
        '\\t\\t\\t<AxReportParameterBase xmlns=""\\n' +
        '\\t\\t\\t\\t\\ti:type="AxReportParameter">\\n' +
        '\\t\\t\\t\\t<Name>AX_UserContext</Name>\\n' +
        '\\t\\t\\t\\t<AllowBlank>true</AllowBlank>\\n' +
        '\\t\\t\\t\\t<Nullable>true</Nullable>\\n' +
        '\\t\\t\\t\\t<UserVisibility>Hidden</UserVisibility>\\n' +
        '\\t\\t\\t\\t<DefaultValue />\\n' +
        '\\t\\t\\t\\t<Values />\\n' +
        '\\t\\t\\t</AxReportParameterBase>\\n' +
        '\\t\\t\\t<AxReportParameterBase xmlns=""\\n' +
        '\\t\\t\\t\\t\\ti:type="AxReportParameter">\\n' +
        '\\t\\t\\t\\t<Name>AX_RenderingCulture</Name>\\n' +
        '\\t\\t\\t\\t<AllowBlank>true</AllowBlank>\\n' +
        '\\t\\t\\t\\t<Nullable>true</Nullable>\\n' +
        '\\t\\t\\t\\t<UserVisibility>Hidden</UserVisibility>\\n' +
        '\\t\\t\\t\\t<DefaultValue />\\n' +
        '\\t\\t\\t\\t<Values />\\n' +
        '\\t\\t\\t</AxReportParameterBase>\\n' +
        '\\t\\t\\t<AxReportParameterBase xmlns=""\\n' +
        '\\t\\t\\t\\t\\ti:type="AxReportParameter">\\n' +
        '\\t\\t\\t\\t<Name>AX_ReportContext</Name>\\n' +
        '\\t\\t\\t\\t<AllowBlank>true</AllowBlank>\\n' +
        '\\t\\t\\t\\t<Nullable>true</Nullable>\\n' +
        '\\t\\t\\t\\t<UserVisibility>Hidden</UserVisibility>\\n' +
        '\\t\\t\\t\\t<DefaultValue />\\n' +
        '\\t\\t\\t\\t<Values />\\n' +
        '\\t\\t\\t</AxReportParameterBase>\\n' +
        '\\t\\t\\t<AxReportParameterBase xmlns=""\\n' +
        '\\t\\t\\t\\t\\ti:type="AxReportParameter">\\n' +
        '\\t\\t\\t\\t<Name>AX_RdpPreProcessedId</Name>\\n' +
        '\\t\\t\\t\\t<AllowBlank>true</AllowBlank>\\n' +
        '\\t\\t\\t\\t<Nullable>true</Nullable>\\n' +
        '\\t\\t\\t\\t<UserVisibility>Hidden</UserVisibility>\\n' +
        '\\t\\t\\t\\t<DefaultValue />\\n' +
        '\\t\\t\\t\\t<Values />\\n' +
        '\\t\\t\\t</AxReportParameterBase>\\n' +
        '\\t\\t</ReportParameterBases>\\n' +
        '\\t</DefaultParameterGroup>';
      xml = xml.replace('<Designs>', \`\${defaultParamGroup}\n\t<Designs>\`);
      console.error('[sanitizeReportXml] Added missing <DefaultParameterGroup>');
    }

    // 8. Fix embedded RDL: move <PageHeader>/<PageFooter> inside <Page> when they
    //    appear as direct children of <Report> — SSRS schema violation that causes
    //    "Deserialization failed: invalid child element 'PageHeader'" in VS Designer.
    xml = xml.replace(/(<Text><!\\[CDATA\\[)([\\s\\S]*?)(\\]\\]><\\/Text>)/, (_whole, open, rdl, close) => {
      if (!rdl.includes('<PageHeader') && !rdl.includes('<PageFooter')) return _whole;
      // Already wrapped inside a <Page> element — nothing to do
      if (rdl.match(/<Page[\\s\\S]*?<\\/Page>/)) return _whole;
      let fixedRdl = rdl;
      let pageContent = '';
      const phMatch = fixedRdl.match(/<PageHeader[\\s\\S]*?<\\/PageHeader>/);
      if (phMatch) { pageContent += phMatch[0]; fixedRdl = fixedRdl.replace(phMatch[0], ''); }
      const pfMatch = fixedRdl.match(/<PageFooter[\\s\\S]*?<\\/PageFooter>/);
      if (pfMatch) { pageContent += (pageContent ? '\\n' : '') + pfMatch[0]; fixedRdl = fixedRdl.replace(pfMatch[0], ''); }
      if (!pageContent) return _whole;
      const pageEl = '<Page>\\n' + pageContent.trim() + '\\n</Page>';
      fixedRdl = fixedRdl.includes('</Body>')
        ? fixedRdl.replace('</Body>', '</Body>\\n' + pageEl)
        : fixedRdl.replace('</Report>', pageEl + '\\n</Report>');
      console.error('[sanitizeReportXml] Moved <PageHeader>/<PageFooter> inside <Page> in embedded RDL');
      return open + fixedRdl + close;
    });

`;

// ── Find insertion point ──────────────────────────────────────────────────────
const MARKER = '    return xml;\n  }\n}\n\n/**\n * Visual Studio Project';
const MARKER_CRLF = '    return xml;\r\n  }\r\n}\r\n\r\n/**\r\n * Visual Studio Project';

let markerUsed = null;
if (src.includes(MARKER)) markerUsed = MARKER;
else if (src.includes(MARKER_CRLF)) markerUsed = MARKER_CRLF;
else { console.error('MARKER NOT FOUND'); process.exit(1); }

// Normalize the newFixes line endings to match the file
const eol = markerUsed.includes('\r\n') ? '\r\n' : '\n';
const normalizedFixes = newFixes.replace(/\r?\n/g, eol);
const replacement = normalizedFixes + markerUsed;

const patched = src.replace(markerUsed, replacement);
if (patched === src) { console.error('REPLACEMENT FAILED — no change'); process.exit(1); }

writeFileSync(f, patched, 'utf8');
console.log(`Patched: ${f}`);
console.log(`File size: ${patched.length} bytes`);
