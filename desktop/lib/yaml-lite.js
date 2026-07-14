// 경량 YAML 파서 — pumasi.config.yaml 전용 (외부 의존성 없음)
function parse(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const indent = raw.match(/^\s*/)[0].length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const arrItem = line.match(/^\s*-\s+name:\s*(.+)$/);
    if (arrItem) {
      let target = parent;
      if (!Array.isArray(target)) {
        const key = stack[stack.length - 1].key;
        const container = stack[stack.length - 2].obj;
        container[key] = [];
        target = container[key];
        stack[stack.length - 1].obj = target;
      }
      const item = { name: arrItem[1].trim() };
      target.push(item);
      stack.push({ indent, obj: item, key: null });
      continue;
    }
    const kv = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[2];
    let val = kv[3].trim();
    if (val === '|' || val === '>') {
      const lines = [];
      const baseIndent = indent;
      let j = text.split(/\r?\n/).indexOf(raw) + 1;
      const all = text.split(/\r?\n/);
      for (; j < all.length; j++) {
        const next = all[j];
        if (!next.trim()) {
          lines.push('');
          continue;
        }
        const nextIndent = next.match(/^\s*/)[0].length;
        if (nextIndent <= baseIndent) break;
        lines.push(next.slice(baseIndent + 2));
      }
      const block = lines.join('\n').trimEnd();
      if (Array.isArray(parent)) parent[parent.length - 1][key] = block;
      else parent[key] = block;
      continue;
    }
    if (!val) {
      const child = {};
      if (Array.isArray(parent)) parent[parent.length - 1][key] = child;
      else parent[key] = child;
      stack.push({ indent, obj: child, key });
    } else if (val.startsWith('[')) {
      try { val = JSON.parse(val.replace(/'/g, '"')); } catch { val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')); }
      parent[key] = val;
    } else {
      parent[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return root;
}

module.exports = { parse };
