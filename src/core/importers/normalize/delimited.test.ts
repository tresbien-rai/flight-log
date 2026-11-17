import { describe, expect, it } from 'vitest';
import { parseDelimited } from './delimited';

const csv = (t: string) => parseDelimited(t, ',');

describe('parseDelimited', () => {
  it('parses simple rows', () => {
    expect(csv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('supports tab delimiter and leaves commas alone', () => {
    expect(parseDelimited('a,b\tc\n', '\t')).toEqual([['a,b', 'c']]);
  });
  it('returns no records for empty input', () => {
    expect(csv('')).toEqual([]);
    expect(csv('﻿')).toEqual([]);
  });
  it('accepts CRLF and LF', () => {
    expect(csv('a,b\r\nc,d\ne,f\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });
  it('strips a leading BOM only', () => {
    expect(csv('﻿a,b')).toEqual([['a', 'b']]);
    expect(csv('a,﻿b')).toEqual([['a', '﻿b']]);
  });
  it('does not emit a trailing empty record', () => {
    expect(csv('a\n')).toEqual([['a']]);
    expect(csv('a\r\n')).toEqual([['a']]);
  });
  it('keeps blank records in the middle', () => {
    expect(csv('a\n\nb')).toEqual([['a'], [''], ['b']]);
    expect(csv('a\r\n\r\nb\r\n')).toEqual([['a'], [''], ['b']]);
    expect(csv('a\n\n')).toEqual([['a'], ['']]);
  });
  it('keeps empty fields, including trailing ones', () => {
    expect(csv('a,,c')).toEqual([['a', '', 'c']]);
    expect(csv('a,')).toEqual([['a', '']]);
    expect(csv(',')).toEqual([['', '']]);
    expect(csv('a,\nb')).toEqual([['a', ''], ['b']]);
  });
  it('handles quoted delimiters, newlines and CRLF', () => {
    expect(csv('"a,b","c\nd","e\r\nf"\n')).toEqual([['a,b', 'c\nd', 'e\r\nf']]);
  });
  it('handles escaped quotes', () => {
    expect(csv('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
    expect(csv('""""')).toEqual([['"']]);
    expect(csv('""')).toEqual([['']]);
  });
  it('treats a mid-field quote as literal', () => {
    expect(csv('ab"c,d')).toEqual([['ab"c', 'd']]);
    expect(csv('5" pipe,x')).toEqual([['5" pipe', 'x']]);
    expect(csv(' "a,b"')).toEqual([[' "a', 'b"']]);
  });
  it('does not trim cells', () => {
    expect(csv(' a , b ')).toEqual([[' a ', ' b ']]);
    expect(csv('" a "')).toEqual([[' a ']]);
  });
  it('tolerates an unterminated quote by taking the rest', () => {
    expect(csv('a,"b\nc')).toEqual([['a', 'b\nc']]);
  });
  it('tolerates text after a closing quote', () => {
    expect(csv('"a"b,c')).toEqual([['ab', 'c']]);
  });
  it('treats a lone CR as content', () => {
    expect(csv('a\rb,c')).toEqual([['a\rb', 'c']]);
  });
  it('handles a quoted field at EOF and before a newline', () => {
    expect(csv('a,"b"')).toEqual([['a', 'b']]);
    expect(csv('"a"\n"b"\n')).toEqual([['a'], ['b']]);
  });
  it('parses a tab file with quoted tabs', () => {
    expect(parseDelimited('"a\tb"\tc\r\n', '\t')).toEqual([['a\tb', 'c']]);
  });
  it('is linear on a 1 MB input', () => {
    const row = 'abc,"quoted ""x"" , y",12345,\n';
    const text = row.repeat(Math.ceil(1_000_000 / row.length));
    const start = Date.now();
    const out = csv(text);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(out.length).toBe(Math.ceil(1_000_000 / row.length));
    expect(out[0]).toEqual(['abc', 'quoted "x" , y', '12345', '']);
    const big = csv(`"${'x'.repeat(1_000_000)}"`);
    expect(big[0]![0]!.length).toBe(1_000_000);
  });
});
