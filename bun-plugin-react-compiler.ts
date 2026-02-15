import babel from "@babel/core";
import BabelPluginReactCompiler from "babel-plugin-react-compiler";

const options = {}; // options passed to react-compiler

const reactCompiler: Bun.BunPlugin = {
  name: "react-compiler",
  setup({ onLoad }) {
    onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
      const input = await Bun.file(args.path).text();
      const result = await babel.transformAsync(input, {
        filename: args.path,
        plugins: [[BabelPluginReactCompiler, options]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        ast: false,
        sourceMaps: false, // could use Bun.env.NODE_ENV == "dev"
        configFile: false,
        babelrc: false,
      });

      if (result?.code == null)
        throw new Error(`Failed to compile ${args.path}`);

      return { contents: result.code, loader: "tsx" };
    });
  },
};

export default reactCompiler;
