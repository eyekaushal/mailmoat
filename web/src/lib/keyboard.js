/** True while the key press belongs to a text field, so single-letter shortcuts stay quiet. */
export function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}
