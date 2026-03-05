/**
 * Tests for rewrapXmlTagAsCdata — the utility that preserves CDATA wrapping and
 * doc-comment content after xml2js parse+rebuild cycles in modifyD365FileTool.
 *
 * Root cause: xml2js strips <![CDATA[...]]> wrappers when parsing XML, and the
 * Builder entity-encodes < > & when re-serialising plain text content. This means:
 *   - `/// <summary>` doc comments become `/// &lt;summary&gt;`
 *   - Generic types like `List<str>` become `List&lt;str&gt;`
 *   - D365FO requires CDATA in <Declaration> and <Source> — without it the file is
 *     technically valid XML but D365FO tooling/compiler may reject it or show errors.
 *
 * The fix (rewrapXmlTagAsCdata) post-processes the Builder output to:
 *   1. Decode entity-encoded characters back to raw X++ source
 *   2. Wrap the content in <![CDATA[...]]>
 */

import { describe, it, expect } from 'vitest';
import { parseStringPromise, Builder } from 'xml2js';
import { rewrapXmlTagAsCdata } from '../../src/tools/modifyD365File';

// Helper: simulate the full xml2js parse → mutate → build cycle
async function roundTrip(xml: string, mutate?: (obj: any) => void): Promise<string> {
  const obj = await parseStringPromise(xml);
  if (mutate) mutate(obj);
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'utf-8' },
    renderOpts: { pretty: true, indent: '\t', newline: '\n' },
    headless: false,
  });
  let out = builder.buildObject(obj);
  out = rewrapXmlTagAsCdata('Declaration', out);
  out = rewrapXmlTagAsCdata('Source', out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('rewrapXmlTagAsCdata()', () => {

  it('should wrap plain-text <Declaration> content in CDATA', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AxClass>
<SourceCode>
<Declaration><![CDATA[
public class Foo
{
}
]]></Declaration>
<Methods />
</SourceCode>
</AxClass>`;

    const result = await roundTrip(xml);
    expect(result).toContain('<Declaration><![CDATA[');
    expect(result).toContain('public class Foo');
  });

  it('should preserve /// doc comments in <Declaration> (not entity-encode < >)', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AxClass>
<SourceCode>
<Declaration><![CDATA[
/// <summary>
/// My class.
/// </summary>
public class Foo
{
}
]]></Declaration>
<Methods />
</SourceCode>
</AxClass>`;

    const result = await roundTrip(xml);
    expect(result).toContain('/// <summary>');
    expect(result).not.toContain('/// &lt;summary&gt;');
  });

  it('should preserve generic type parameters in <Source> (not entity-encode < >)', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AxClass>
<SourceCode>
<Declaration><![CDATA[
public class Foo
{
}
]]></Declaration>
<Methods>
<Method>
<Name>run</Name>
<Source><![CDATA[
    public void run()
    {
        List<str> items = new List<str>(Types::String);
    }
]]></Source>
</Method>
</Methods>
</SourceCode>
</AxClass>`;

    const result = await roundTrip(xml);
    expect(result).toContain('<Source><![CDATA[');
    expect(result).toContain('List<str>');
    expect(result).not.toContain('List&lt;str&gt;');
  });

  it('should add method and preserve CDATA format', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AxClass>
<SourceCode>
<Declaration><![CDATA[
public class Foo
{
}
]]></Declaration>
<Methods>
<Method>
<Name>first</Name>
<Source><![CDATA[
    public void first()
    {
    }

]]></Source>
</Method>
</Methods>
</SourceCode>
</AxClass>`;

    const result = await roundTrip(xml, (obj) => {
      // Simulate addMethod()
      obj.AxClass.SourceCode[0].Methods[0].Method.push({
        Name: ['second'],
        Source: ['    public void second()\n    {\n    }'],
      });
    });

    expect(result).toContain('<Name>first</Name>');
    expect(result).toContain('<Name>second</Name>');
    expect(result).toContain('<Source><![CDATA[');
  });

  it('should preserve /// doc comments in <Source> after add-method round-trip', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AxClass>
<SourceCode>
<Declaration><![CDATA[
/// <summary>
/// My class.
/// </summary>
public class Foo
{
}
]]></Declaration>
<Methods>
<Method>
<Name>first</Name>
<Source><![CDATA[
    /// <summary>
    /// First method.
    /// </summary>
    public void first()
    {
    }
]]></Source>
</Method>
</Methods>
</SourceCode>
</AxClass>`;

    const result = await roundTrip(xml, (obj) => {
      obj.AxClass.SourceCode[0].Methods[0].Method.push({
        Name: ['second'],
        Source: [
          '    /// <summary>\n    /// Second method.\n    /// </summary>\n    public void second()\n    {\n    }'
        ],
      });
    });

    // Class declaration doc comment preserved
    expect(result).toContain('/// My class.');
    // Existing method doc comment preserved
    expect(result).toContain('/// First method.');
    // New method doc comment preserved
    expect(result).toContain('/// Second method.');
    // No entity-encoded angle brackets
    expect(result).not.toContain('&lt;summary&gt;');
    // CDATA wrappers present
    expect(result).toContain('<Declaration><![CDATA[');
    expect(result).toContain('<Source><![CDATA[');
  });

  it('should decode &amp; back to & inside CDATA content', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AxClass>
<SourceCode>
<Declaration><![CDATA[
public class Foo
{
}
]]></Declaration>
<Methods>
<Method>
<Name>test</Name>
<Source><![CDATA[
    public void test()
    {
        if (a > 0 && b < 10)
        {
            info("ok");
        }
    }
]]></Source>
</Method>
</Methods>
</SourceCode>
</AxClass>`;

    const result = await roundTrip(xml);
    // && must survive (not become &amp;&amp;)
    expect(result).toContain('a > 0 && b < 10');
    expect(result).not.toContain('&amp;&amp;');
  });

  it('rewrapXmlTagAsCdata is idempotent — double application does not corrupt content', () => {
    const xml = `<Root><Source><![CDATA[\npublic void foo() { }\n\n]]></Source></Root>`;
    const once = rewrapXmlTagAsCdata('Source', xml);
    const twice = rewrapXmlTagAsCdata('Source', once);
    // Content must be identical after second pass
    expect(once).toBe(twice);
  });
});
