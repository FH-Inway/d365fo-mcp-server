
# Patch sanitizeReportXml in createD365File.ts — add fixes 6, 7, 8
$f = "c:\Users\Admin7e00859cee\source\repos\d365fo-mcp-server\src\tools\createD365File.ts"
$content = Get-Content -Raw -Encoding UTF8 $f

$marker = "    return xml;`r`n  }`r`n}`r`n`r`n/**`r`n * Visual Studio Project"
if (-not $content.Contains($marker)) {
  Write-Error "MARKER NOT FOUND — check CRLF/LF or indentation"
  exit 1
}

$newFixes = @'
    // 6. Ensure <Parameters> block inside <AxReportDataSet> for real RDP datasets.
    //    The block is skipped for stub/minimal datasets that have no <DataSourceType>.
    if (xml.includes('<DataSourceType>') && !xml.includes('<Parameters>')) {
      const axDatasetParams =
        '\t\t\t<Parameters>\n' +
        '\t\t\t\t<AxReportDataSetParameter>\n' +
        '\t\t\t\t\t<Name>AX_PartitionKey</Name>\n' +
        '\t\t\t\t\t<Alias>AX_PartitionKey</Alias>\n' +
        '\t\t\t\t\t<DataType>System.String</DataType>\n' +
        '\t\t\t\t\t<Parameter>AX_PartitionKey</Parameter>\n' +
        '\t\t\t\t</AxReportDataSetParameter>\n' +
        '\t\t\t\t<AxReportDataSetParameter>\n' +
        '\t\t\t\t\t<Name>AX_CompanyName</Name>\n' +
        '\t\t\t\t\t<Alias>AX_CompanyName</Alias>\n' +
        '\t\t\t\t\t<DataType>System.String</DataType>\n' +
        '\t\t\t\t\t<Parameter>AX_CompanyName</Parameter>\n' +
        '\t\t\t\t</AxReportDataSetParameter>\n' +
        '\t\t\t\t<AxReportDataSetParameter>\n' +
        '\t\t\t\t\t<Name>AX_UserContext</Name>\n' +
        '\t\t\t\t\t<Alias>AX_UserContext</Alias>\n' +
        '\t\t\t\t\t<DataType>System.String</DataType>\n' +
        '\t\t\t\t\t<Parameter>AX_UserContext</Parameter>\n' +
        '\t\t\t\t</AxReportDataSetParameter>\n' +
        '\t\t\t\t<AxReportDataSetParameter>\n' +
        '\t\t\t\t\t<Name>AX_RenderingCulture</Name>\n' +
        '\t\t\t\t\t<Alias>AX_RenderingCulture</Alias>\n' +
        '\t\t\t\t\t<DataType>System.String</DataType>\n' +
        '\t\t\t\t\t<Parameter>AX_RenderingCulture</Parameter>\n' +
        '\t\t\t\t</AxReportDataSetParameter>\n' +
        '\t\t\t\t<AxReportDataSetParameter>\n' +
        '\t\t\t\t\t<Name>AX_ReportContext</Name>\n' +
        '\t\t\t\t\t<Alias>AX_ReportContext</Alias>\n' +
        '\t\t\t\t\t<DataType>System.String</DataType>\n' +
        '\t\t\t\t\t<Parameter>AX_ReportContext</Parameter>\n' +
        '\t\t\t\t</AxReportDataSetParameter>\n' +
        '\t\t\t\t<AxReportDataSetParameter>\n' +
        '\t\t\t\t\t<Name>AX_RdpPreProcessedId</Name>\n' +
        '\t\t\t\t\t<Alias>AX_RdpPreProcessedId</Alias>\n' +
        '\t\t\t\t\t<DataType>System.String</DataType>\n' +
        '\t\t\t\t\t<Parameter>AX_RdpPreProcessedId</Parameter>\n' +
        '\t\t\t\t</AxReportDataSetParameter>\n' +
        '\t\t\t</Parameters>';
      if (xml.includes('</Fields>')) {
        xml = xml.replace('</Fields>', `</Fields>\n${axDatasetParams}`);
      } else if (xml.includes('<Fields />')) {
        xml = xml.replace('<Fields />', `<Fields />\n${axDatasetParams}`);
      } else {
        xml = xml.replace('</AxReportDataSet>', `${axDatasetParams}\n\t\t</AxReportDataSet>`);
      }
      console.error('[sanitizeReportXml] Added missing <Parameters> to <AxReportDataSet>');
    }

    // 7. Ensure <DefaultParameterGroup> before <Designs> for real RDP datasets.
    if (xml.includes('<DataSourceType>') && !xml.includes('<DefaultParameterGroup>') && xml.includes('<Designs>')) {
      const defaultParamGroup =
        '\t<DefaultParameterGroup>\n' +
        '\t\t<Name xmlns="">Parameters</Name>\n' +
        '\t\t<ReportParameterBases xmlns="">\n' +
        '\t\t\t<AxReportParameterBase xmlns=""\n' +
        '\t\t\t\t\ti:type="AxReportParameter">\n' +
        '\t\t\t\t<Name>AX_PartitionKey</Name>\n' +
        '\t\t\t\t<AllowBlank>true</AllowBlank>\n' +
        '\t\t\t\t<Nullable>true</Nullable>\n' +
        '\t\t\t\t<UserVisibility>Hidden</UserVisibility>\n' +
        '\t\t\t\t<DefaultValue />\n' +
        '\t\t\t\t<Values />\n' +
        '\t\t\t</AxReportParameterBase>\n' +
        '\t\t\t<AxReportParameterBase xmlns=""\n' +
        '\t\t\t\t\ti:type="AxReportParameter">\n' +
        '\t\t\t\t<Name>AX_CompanyName</Name>\n' +
        '\t\t\t\t<UserVisibility>Hidden</UserVisibility>\n' +
        '\t\t\t\t<DefaultValue />\n' +
        '\t\t\t\t<Values />\n' +
        '\t\t\t</AxReportParameterBase>\n' +
        '\t\t\t<AxReportParameterBase xmlns=""\n' +
        '\t\t\t\t\ti:type="AxReportParameter">\n' +
        '\t\t\t\t<Name>AX_UserContext</Name>\n' +
        '\t\t\t\t<AllowBlank>true</AllowBlank>\n' +
        '\t\t\t\t<Nullable>true</Nullable>\n' +
        '\t\t\t\t<UserVisibility>Hidden</UserVisibility>\n' +
        '\t\t\t\t<DefaultValue />\n' +
        '\t\t\t\t<Values />\n' +
        '\t\t\t</AxReportParameterBase>\n' +
        '\t\t\t<AxReportParameterBase xmlns=""\n' +
        '\t\t\t\t\ti:type="AxReportParameter">\n' +
        '\t\t\t\t<Name>AX_RenderingCulture</Name>\n' +
        '\t\t\t\t<AllowBlank>true</AllowBlank>\n' +
        '\t\t\t\t<Nullable>true</Nullable>\n' +
        '\t\t\t\t<UserVisibility>Hidden</UserVisibility>\n' +
        '\t\t\t\t<DefaultValue />\n' +
        '\t\t\t\t<Values />\n' +
        '\t\t\t</AxReportParameterBase>\n' +
        '\t\t\t<AxReportParameterBase xmlns=""\n' +
        '\t\t\t\t\ti:type="AxReportParameter">\n' +
        '\t\t\t\t<Name>AX_ReportContext</Name>\n' +
        '\t\t\t\t<AllowBlank>true</AllowBlank>\n' +
        '\t\t\t\t<Nullable>true</Nullable>\n' +
        '\t\t\t\t<UserVisibility>Hidden</UserVisibility>\n' +
        '\t\t\t\t<DefaultValue />\n' +
        '\t\t\t\t<Values />\n' +
        '\t\t\t</AxReportParameterBase>\n' +
        '\t\t\t<AxReportParameterBase xmlns=""\n' +
        '\t\t\t\t\ti:type="AxReportParameter">\n' +
        '\t\t\t\t<Name>AX_RdpPreProcessedId</Name>\n' +
        '\t\t\t\t<AllowBlank>true</AllowBlank>\n' +
        '\t\t\t\t<Nullable>true</Nullable>\n' +
        '\t\t\t\t<UserVisibility>Hidden</UserVisibility>\n' +
        '\t\t\t\t<DefaultValue />\n' +
        '\t\t\t\t<Values />\n' +
        '\t\t\t</AxReportParameterBase>\n' +
        '\t\t</ReportParameterBases>\n' +
        '\t</DefaultParameterGroup>';
      xml = xml.replace('<Designs>', `${defaultParamGroup}\n\t<Designs>`);
      console.error('[sanitizeReportXml] Added missing <DefaultParameterGroup>');
    }

    // 8. Fix embedded RDL: move <PageHeader>/<PageFooter> inside <Page> when they
    //    appear as direct children of <Report> — SSRS schema violation that causes
    //    "Deserialization failed: invalid child element 'PageHeader'" in VS Designer.
    xml = xml.replace(/(<Text><!\[CDATA\[)([\s\S]*?)(\]\]><\/Text>)/, (_whole, open: string, rdl: string, close: string) => {
      if (!rdl.includes('<PageHeader') && !rdl.includes('<PageFooter')) return _whole;
      // Already wrapped inside a <Page> element — nothing to do
      const existingPage = rdl.match(/<Page[\s\S]*?<\/Page>/);
      if (existingPage) return _whole;
      let fixedRdl = rdl;
      let pageContent = '';
      const phMatch = fixedRdl.match(/<PageHeader[\s\S]*?<\/PageHeader>/);
      if (phMatch) { pageContent += phMatch[0]; fixedRdl = fixedRdl.replace(phMatch[0], ''); }
      const pfMatch = fixedRdl.match(/<PageFooter[\s\S]*?<\/PageFooter>/);
      if (pfMatch) { pageContent += (pageContent ? '\n' : '') + pfMatch[0]; fixedRdl = fixedRdl.replace(pfMatch[0], ''); }
      if (!pageContent) return _whole;
      const pageEl = '<Page>\n' + pageContent.trim() + '\n</Page>';
      fixedRdl = fixedRdl.includes('</Body>')
        ? fixedRdl.replace('</Body>', '</Body>\n' + pageEl)
        : fixedRdl.replace('</Report>', pageEl + '\n</Report>');
      console.error('[sanitizeReportXml] Moved <PageHeader>/<PageFooter> inside <Page> in embedded RDL');
      return open + fixedRdl + close;
    });

'@

$replacement = $newFixes + "    return xml;`r`n  }`r`n}`r`n`r`n/**`r`n * Visual Studio Project"
$newContent = $content.Replace($marker, $replacement)
if ($newContent -eq $content) { Write-Error "REPLACEMENT FAILED"; exit 1 }
Set-Content -Path $f -Value $newContent -Encoding UTF8 -NoNewline
Write-Output "createD365File.ts patched OK"
