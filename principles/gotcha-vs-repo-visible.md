# Gotcha vs repo-visible

The only question:

```
Could the model work this out by reading the file system and the code?
  yes -> repo-visible. Delete it.
  no  -> gotcha. Keep it, and spend the tokens here.
```

Repo-visible is not a matter of degree. A directory tree, a file list, the
language, the framework, the package manager, the test runner, the layer
names, the dependency direction that a linter already enforces — all of it is
one `ls` or one `cat package.json` away. Restating it costs attention budget
and returns nothing.

A gotcha is a fact that survives reading the code:

- a decision whose reason is not in the repo ("types live in one file because
  the codegen step rewrites it")
- a trap that looks like a bug but is not, or vice versa
- an invariant held by convention that nothing checks
- something true of the environment, not the source

## The structural / prose split

`check.mjs` decides the structural cases and only those: fenced trees, runs of
path-like lines, extension enumerations. Prose is left to judgement. There is
no keyword blacklist — a framework name can appear legitimately inside a real
gotcha, and a blacklist would delete the gotcha to catch the boilerplate.

## Applied to skills

Same question, different subject: does this skill hold anything the model
could not work out on its own? A skill that only says "verify your work" or
"review carefully" is a procedure the model already runs. What survives is the
part that is specific to this repo — the actual command, the gate that must
not be skipped, the environment that has to be up first.

If the answer is nothing, the right output is no skill.
