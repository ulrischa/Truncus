/** Formatting uses UTF-16 offsets, matching native textarea selection ranges. */
export function sliceMarks(marks = [], start, end, offset = 0) {
  return marks.filter(mark => mark.start < end && mark.end > start).map(mark => ({
    ...mark, start: Math.max(mark.start, start) - start + offset,
    end: Math.min(mark.end, end) - start + offset
  }));
}

export function editedMarks(marks, before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start &&
      before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const oldEnd = before.length - tail;
  const newEnd = after.length - tail;
  return marks.map(mark => ({
    ...mark, start: mark.start <= start ? mark.start : Math.max(start, mark.start - oldEnd + newEnd),
    end: mark.end <= start ? mark.end : mark.end >= oldEnd ? mark.end - oldEnd + newEnd : newEnd
  })).filter(mark => mark.end > mark.start);
}

export function renderMarks(target, text, marks, element) {
  if (!marks?.length) return;
  target.replaceChildren();
  const bounds = [...new Set([0, text.length, ...marks.flatMap(mark => [mark.start, mark.end])])].sort((a,b) => a-b);
  for (let i = 1; i < bounds.length; i++) {
    const start = bounds[i-1], end = bounds[i];
    let node = document.createTextNode(text.slice(start, end));
    for (const kind of ['strong', 'em', 'link']) {
      const mark = marks.find(mark => mark.kind === kind && mark.start <= start && mark.end >= end);
      if (!mark) continue;
      const wrapper = element(kind === 'link' ? 'a' : kind);
      if (kind === 'link') wrapper.setAttribute('href', mark.href);
      wrapper.append(node);
      node = wrapper;
    }
    target.append(node);
  }
}
