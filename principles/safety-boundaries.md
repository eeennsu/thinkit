# Where strong constraints stay

The general direction is to delete constraints and let the model use
judgement. The exception is not "areas where the model is weak" — it is areas
where the cost of being wrong is asymmetric: the action leaves the repo, or
cannot be undone.

Anthropic's guidance names the exception but does not enumerate it. Which
areas apply to a given repo is not knowable from outside that repo, so this
plugin asks instead of shipping a list.

Interview Q2 asks it directly. If the answer is empty, no `Safety Boundaries`
section is written. An invented boundary is worse than none: it trains the
reader to skim the section that was supposed to stop them.

If the answer is not empty, the section states the boundary and the approval
path, not a bare prohibition:

```markdown
## Safety Boundaries

- <action> requires explicit user approval before it runs.
- <credential/asset> is never read, printed, or modified by an agent.
```

An approval path is what makes the rule survivable. A rule with no path out
gets worked around the first time it is wrong.
