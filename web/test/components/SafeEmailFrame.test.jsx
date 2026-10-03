import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeEmailFrame, sanitiseEmailHtml } from '../../src/components/SafeEmailFrame.jsx';

describe('sanitiseEmailHtml', () => {
  it('removes scripts, event handlers, forms and styles', () => {
    const out = sanitiseEmailHtml(
      '<p onclick="x()">Hi</p><script>alert(1)</script><form action="https://evil.example"><input></form><style>body{background:url(https://evil.example/p.gif)}</style>',
    );
    expect(out).toBe('<p>Hi</p>');
  });

  it('drops remote images and CSS urls but keeps inline data images', () => {
    const out = sanitiseEmailHtml(
      '<img src="https://evil.example/pixel.gif?d=secret"><img src="data:image/png;base64,AAAA"><div style="background:url(https://evil.example/x)">x</div>',
    );
    expect(out).not.toContain('evil.example');
    expect(out).toContain('data:image/png;base64,AAAA');
    expect(out).toContain('<div>x</div>');
  });

  it('keeps link text but removes the destination', () => {
    const out = sanitiseEmailHtml(
      '<a href="https://evil.example/login" target="_blank">Log in</a>',
    );
    expect(out).toBe('<a>Log in</a>');
  });

  it('returns an empty string for nothing', () => {
    expect(sanitiseEmailHtml(null)).toBe('');
  });
});

describe('SafeEmailFrame', () => {
  it('renders a fully sandboxed iframe with a no-remote CSP in its document', () => {
    const { container } = render(
      <SafeEmailFrame html="<p>Hello</p><img src='https://t.example/p.gif'>" />,
    );
    const frame = container.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    const doc = frame.getAttribute('srcdoc');
    expect(doc).toContain("default-src 'none'; img-src data:");
    expect(doc).toContain('<p>Hello</p>');
    expect(doc).not.toContain('t.example');
  });
});
