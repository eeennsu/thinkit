// 최소한의 {{key}} 치환. 템플릿 엔진은 쓰지 않는다. 이 플러그인은 남의 레포에서 맨
// node로 돌고, 거기서의 의존성은 우리가 그쪽에 지우는 비용이다.
export function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`템플릿 자리표시자 {{${key}}}에 값이 없다`);
    return String(vars[key]);
  });
}
