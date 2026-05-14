/**
 * Build script for the Express/MCP server.
 *
 * Problem: @modelcontextprotocol/sdk has "type":"module" and uses wildcard
 * exports WITHOUT .js extension (e.g. "./dist/cjs/*" instead of "./dist/cjs/*.js").
 * esbuild (and Node.js v24 in Electron) cannot resolve these paths at runtime.
 *
 * Solution: an esbuild plugin that intercepts all @modelcontextprotocol/sdk
 * sub-path imports and appends .js, which then matches the correct CJS file.
 */
import * as esbuild from "esbuild";

/** Packages that use native bindings or load assets from their own directory. */
const EXTERNAL = [
    "sharp",
    "tesseract.js",
    "pdfkit",
    "mammoth",
    "fsevents",
    "canvas",
    "@napi-rs/canvas",   // native module needed by pdfjs-dist for DOMMatrix polyfill
    "pdf-parse",          // ESM package that loads pdfjs-dist; let Node resolve it at runtime
    "undici",             // shared instance requis pour setGlobalDispatcher (patch timeouts Ollama)
];

/**
 * Plugin that fixes ESM-only packages whose exports map wildcards
 * are missing the .js extension.
 */
const fixEsmExportsPlugin = {
    name: "fix-esm-exports",
    setup(build) {
        // Intercept all @modelcontextprotocol/sdk sub-path imports
        build.onResolve({ filter: /^@modelcontextprotocol\/sdk\// }, async (args) => {
            if (args.path.endsWith(".js") || args.path.endsWith(".mjs") || args.path.endsWith(".cjs")) {
                return; // already has extension, let esbuild handle it
            }
            // Re-resolve with explicit .js extension → hits the correct CJS file
            const result = await build.resolve(args.path + ".js", {
                kind: args.kind,
                resolveDir: args.resolveDir,
            });
            if (result && result.errors.length === 0) {
                return result;
            }
        });
    },
};

// DOMMatrix polyfill injected before any module initialises.
// pdfjs-dist (used by pdf-parse) calls `new DOMMatrix()` at the top level of
// its CJS bundle. Electron's utilityProcess does NOT expose browser APIs, so we
// provide a minimal 2-D transform matrix that satisfies pdfjs-dist needs.
const DOMMATRIX_POLYFILL = `
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
      this.is2D = true; this.isIdentity = true;
      if (Array.isArray(init) && init.length === 6) {
        // [a, b, c, d, e, f]
        this.m11 = init[0]; this.m12 = init[1];
        this.m21 = init[2]; this.m22 = init[3];
        this.m41 = init[4]; this.m42 = init[5];
        this.isIdentity = false;
      }
    }
    get a() { return this.m11; } set a(v) { this.m11 = v; }
    get b() { return this.m12; } set b(v) { this.m12 = v; }
    get c() { return this.m21; } set c(v) { this.m21 = v; }
    get d() { return this.m22; } set d(v) { this.m22 = v; }
    get e() { return this.m41; } set e(v) { this.m41 = v; }
    get f() { return this.m42; } set f(v) { this.m42 = v; }
    multiply(other) {
      const r = new DOMMatrix();
      r.m11 = this.m11*other.m11 + this.m12*other.m21;
      r.m12 = this.m11*other.m12 + this.m12*other.m22;
      r.m21 = this.m21*other.m11 + this.m22*other.m21;
      r.m22 = this.m21*other.m12 + this.m22*other.m22;
      r.m41 = this.m41*other.m11 + this.m42*other.m21 + other.m41;
      r.m42 = this.m41*other.m12 + this.m42*other.m22 + other.m42;
      return r;
    }
    inverse() { return new DOMMatrix(); }
    translate(x, y) {
      const r = new DOMMatrix([this.a,this.b,this.c,this.d,this.e+x,this.f+y]);
      return r;
    }
    scale(sx, sy) {
      const r = new DOMMatrix([this.a*sx,this.b*sy,this.c*sx,this.d*sy,this.e,this.f]);
      return r;
    }
  };
}
`;

await esbuild.build({
    entryPoints: ["server/server-http.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: "dist-server/server-http.js",
    external: EXTERNAL,
    plugins: [fixEsmExportsPlugin],
    logLevel: "info",
    banner: { js: DOMMATRIX_POLYFILL },
});
