import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import postcss from "postcss";

/** Packages native utilities and preflight inside the owning chat, keeping host
 * applications independent of Tailwind and preventing a document-wide reset.
 */
class Styles {
  build(): void {
    const source = postcss.parse(readFileSync("dist/ui/native.css", "utf8"));
    const globals = postcss.root();
    source.walkAtRules("property", rule => { globals.append(rule.clone()); rule.remove(); });
    source.walkRules(rule => {
      rule.selector = rule.selector.replace(/:root|:host\b|\bhtml\b/g, ":scope");
    });
    const scope = postcss.atRule({ name: "scope", params: "(.caltra-chat)" });
    scope.append(source.nodes);
    globals.append(scope);
    writeFileSync("dist/ui/styles.css", globals.toString() + "\n" + readFileSync("src/ui/host.css", "utf8"));
    unlinkSync("dist/ui/native.css");
  }
}
new Styles().build();
