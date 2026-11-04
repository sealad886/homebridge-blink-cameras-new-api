const { pathToFileURL } = require('node:url');
const ts = require('typescript');

// Jest's CommonJS VM cannot require the supported host's ESM directly. Keep
// module-relative metadata URLs intact while compiling only its test imports.
module.exports = {
  process(sourceText, sourcePath) {
    const sourceUrl = pathToFileURL(sourcePath).href;
    const importMetaUrl = context => {
      const visit = node => {
        if (ts.isPropertyAccessExpression(node)
          && ts.isMetaProperty(node.expression)
          && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
          && node.name.text === 'url') {
          return ts.factory.createStringLiteral(sourceUrl);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    };
    const result = ts.transpileModule(sourceText, {
      fileName: sourcePath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, sourceMap: true },
      transformers: { before: [importMetaUrl] },
    });
    return { code: result.outputText, map: result.sourceMapText };
  },
};
