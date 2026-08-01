// Minimal {{key}} substitution. No template engine: the plugin runs on bare node
// in someone else's repo, and a dependency there is a cost we impose on them.
export function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`template placeholder {{${key}}} has no value`);
    return String(vars[key]);
  });
}
