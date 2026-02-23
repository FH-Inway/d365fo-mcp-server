# UDE (Unified Developer Experience) Support Design

**Date:** 2026-02-23
**Status:** Approved
**Branch:** feature/ude-support

## Problem Statement

The MCP server was built for the traditional D365FO on-prem development model where:
- All packages live under a single `PackagesLocalDirectory` (e.g., `K:\AOSService\PackagesLocalDirectory`)
- Package name equals model name (path: `ModelName\ModelName\AxClass\`)

With UDE via Power Platform Tools in VS2022:
- **Custom code** lives in a separate root (e.g., `C:\CustomXppMetadata...`) defined by `ModelStoreFolder` in XPP config
- **Microsoft code** lives in a version-specific path (e.g., `C:\Users\...\Dynamics365\10.0.2428.63\PackagesLocalDirectory`) defined by `FrameworkDirectory`
- Packages can contain multiple models (e.g., "Enhancements" package has 100+ models)
- Path structure is `PackageName\ModelName\AxClass\` where PackageName != ModelName

### Specific Failures

1. `create_d365fo_file` builds path as `basePath\ModelName\ModelName\AxClass\` which doesn't exist in UDE
2. `modify_d365fo_file` can't locate files because it uses the wrong path pattern
3. `create_label` has hardcoded `K:\AosService\PackagesLocalDirectory` default
4. No support for dual metadata roots (custom vs Microsoft packages)

## Design

### 1. XPP Config Provider

**New file:** `src/utils/xppConfigProvider.ts`

Reads XPP config JSON files from `%LOCALAPPDATA%\Microsoft\Dynamics365\XPPConfig\`.

**Responsibilities:**
- List available configs (sorted by modification time, newest first)
- Select active config via `XPP_CONFIG_NAME` env var or auto-select newest
- Extract and expose:
  - `customPackagesPath` from `ModelStoreFolder`
  - `microsoftPackagesPath` from `FrameworkDirectory`
  - `xrefDbName` from `CrossReferencesDatabaseName`
  - `xrefDbServer` from `CrossReferencesDbServerName`
  - `configName` + `version` (parsed from `{name}___{version}.json` filename)

**XPP Config JSON structure** (at `%LOCALAPPDATA%\Microsoft\Dynamics365\XPPConfig\{name}___{version}.json`):
```json
{
  "ModelStoreFolder": "C:\\CustomXppMetadatandynwcfg.isz",
  "FrameworkDirectory": "C:\\Users\\...\\Dynamics365\\10.0.2428.63\\PackagesLocalDirectory",
  "ReferencePackagesPaths": ["C:\\Users\\...\\PackagesLocalDirectory"],
  "CrossReferencesDatabaseName": "XRef_...",
  "CrossReferencesDbServerName": "(LocalDB)\\MSSQLLocalDB"
}
```

### 2. Environment Configuration

**New `.env` variables:**
```
DEV_ENVIRONMENT_TYPE=auto              # auto | traditional | ude
XPP_CONFIG_NAME=                       # e.g., heb-lebarre2-udx___10.0.2428.63 (empty = newest)
CUSTOM_PACKAGES_PATH=                  # Override custom X++ root
MICROSOFT_PACKAGES_PATH=              # Override Microsoft X++ root
```

**Auto-detection logic:**
1. If XPP config files exist in `%LOCALAPPDATA%\Microsoft\Dynamics365\XPPConfig\` -> `ude`
2. Otherwise -> `traditional` (single PackagesLocalDirectory)

**Path resolution priority:**
1. Explicit `.env` overrides (`CUSTOM_PACKAGES_PATH` / `MICROSOFT_PACKAGES_PATH`)
2. XPP config file values (in `auto` or `ude` mode)
3. Existing `PACKAGES_PATH` env var (backward compatible for `traditional`)
4. `.mcp.json` context `packagePath`
5. Default `K:\AosService\PackagesLocalDirectory`

### 3. Package Resolver

**New file:** `src/utils/packageResolver.ts`

Maps `modelName` to `packageName` using descriptor XML files.

**Resolution strategy (in order):**
1. If `packageName` explicitly provided -> use directly
2. Descriptor scan: read `{Root}/{PackageName}/Descriptor/*.xml`, parse `<Name>` (model name) and `<ModelModule>` (package name) tags, build `Map<modelName, packageName>`
3. Filesystem scan fallback: enumerate `{Root}/{PackageName}/{ModelName}/` directories
4. Same-name assumption: if `modelName` matches a top-level directory that contains `{modelName}/{AOTType}` folders, assume `packageName == modelName` (backward compatible with traditional layout)

**Descriptor XML key fields:**
```xml
<Name>HEB 3PL Inventory Upload</Name>          <!-- model name -->
<ModelModule>Enhancements</ModelModule>          <!-- package name -->
```

**Caching:** Build lookup lazily on first use, scanning both custom and Microsoft roots. Cache invalidated on config change.

The resolver also tracks which root (custom vs Microsoft) each model was found in, so the correct base path can be selected automatically.

### 4. Tool Schema Changes

#### `create_d365fo_file`

New parameter:
```typescript
packageName: z.string().optional()
  .describe('Package name (e.g., Enhancements). Auto-resolved from model if omitted.')
```

Path construction fix (src/tools/createD365File.ts:788-793):
```typescript
// BEFORE (broken for UDE):
const modelPath = path.join(basePath, actualModelName, actualModelName, objectFolder);

// AFTER:
const resolvedPackage = args.packageName || await packageResolver.resolve(actualModelName);
const modelPath = path.join(basePath, resolvedPackage, actualModelName, objectFolder);
```

Base path selection: determined by which root the model was found in (custom or Microsoft).

#### `modify_d365fo_file`

New parameter:
```typescript
packageName: z.string().optional()
  .describe('Package name. Auto-resolved if omitted.')
```

#### `create_label`

New parameter:
```typescript
packageName: z.string().optional()
  .describe('Package name for label file location. Auto-resolved if omitted.')
```

Remove hardcoded `K:\AosService\PackagesLocalDirectory` default from `packagePath`. Auto-detect from environment config.

### 5. ConfigManager Updates

**New methods:**
- `getCustomPackagesPath(): string | null`
- `getMicrosoftPackagesPath(): string | null`
- `getDevEnvironmentType(): 'traditional' | 'ude'`

**Updated `McpContext` interface:**
```typescript
interface McpContext {
  workspacePath?: string;
  packagePath?: string;             // backward compat
  customPackagesPath?: string;      // NEW
  microsoftPackagesPath?: string;   // NEW
  projectPath?: string;
  solutionPath?: string;
  devEnvironmentType?: 'auto' | 'traditional' | 'ude'; // NEW
}
```

Existing `getPackagePath()` becomes environment-type-aware:
- `traditional` -> returns existing single path
- `ude` -> returns custom packages path as primary (where new files are created)

### 6. WorkspaceDetector Updates

**Updated `D365ProjectInfo`:**
```typescript
interface D365ProjectInfo {
  projectPath?: string;
  modelName: string;
  packageName?: string;     // NEW
  solutionPath?: string;
  packagePath?: string;
}
```

In UDE mode, also attempt to extract `packageName` from the workspace path structure or descriptor files.

### 7. Metadata Extraction + Database Updates

**`scripts/extract-metadata.ts`:**
- Accept dual source paths
- Scan both `customPackagesPath` and `microsoftPackagesPath` in UDE mode
- Use `PackageName\ModelName\{AOTType}\` structure
- Include `packageName` in extracted metadata

**`scripts/build-database.ts`:**
- Store `packageName` alongside `modelName` in SQLite
- Enable filtering by package

**`metadata/symbolIndex.ts`:**
- Add `package_name` column
- Include `packageName` in search results and `get_*_info` responses

**`metadata/xmlParser.ts`:**
- Accept `PackageName\ModelName` path pattern

**`metadata/labelParser.ts`:**
- Use package-aware path: `{Root}\{PackageName}\{ModelName}\AxLabelFile\`

## Backward Compatibility

- `DEV_ENVIRONMENT_TYPE=traditional` preserves all existing behavior exactly
- `PACKAGES_PATH` env var continues to work for single-path setups
- `.mcp.json` `packagePath` continues to work
- When `packageName == modelName` (common case), the new path `basePath\PackageName\ModelName\` produces the same result as old `basePath\ModelName\ModelName\`
- All new parameters are optional with smart defaults
- VS2022 features (.rnrproj detection, addToProject, solutionPath) are unaffected

## Folder Structure Reference

```
UDE Custom Root (ModelStoreFolder):
  C:\CustomXppMetadata...\
    Enhancements\                    # Package
      Descriptor\
        HEB Advanced DB Logging.xml  # Model descriptor
        HEB Utilities.xml
      HEB Advanced DB Logging\       # Model
        AxClass\
        AxTable\
      HEB Utilities\                 # Model
        AxClass\
    ALDairy\                         # Package (name == model name)
      Descriptor\
        ALDairy.xml
      ALDairy\                       # Model
        AxClass\

UDE Microsoft Root (FrameworkDirectory):
  C:\Users\...\10.0.2428.63\PackagesLocalDirectory\
    ApplicationSuite\                # Package
      Descriptor\
      Foundation\                    # Model
        AxClass\
      SCMControls\                   # Model
        AxClass\
    ApplicationPlatform\             # Package
      ...

Traditional (on-prem):
  K:\AOSService\PackagesLocalDirectory\
    MyModel\                         # Package == Model
      MyModel\
        AxClass\
```

## Files to Create

- `src/utils/xppConfigProvider.ts` - XPP config file reader
- `src/utils/packageResolver.ts` - Model-to-package name resolver

## Files to Modify

- `src/utils/configManager.ts` - Dual path support, environment type
- `src/utils/workspaceDetector.ts` - Package name in D365ProjectInfo
- `src/utils/modelClassifier.ts` - Package-aware classification
- `src/tools/createD365File.ts` - PackageName param, fixed path construction
- `src/tools/modifyD365File.ts` - PackageName param, fixed file location
- `src/tools/createLabel.ts` - PackageName param, dynamic default path
- `src/server/mcpServer.ts` - Updated tool descriptions/schemas
- `src/types/context.ts` - Updated interfaces
- `src/metadata/symbolIndex.ts` - package_name column
- `src/metadata/xmlParser.ts` - Package-aware path parsing
- `src/metadata/labelParser.ts` - Package-aware label paths
- `scripts/extract-metadata.ts` - Dual path scanning
- `scripts/build-database.ts` - Store packageName
- `.env.example` - New variables documented
- `.mcp.json.example` - New context fields
