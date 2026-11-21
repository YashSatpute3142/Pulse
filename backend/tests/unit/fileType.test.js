// UNIT: magic-byte sniffing. No database, no network.
import { describe, it, expect } from 'vitest';
import { sniff } from '../../src/utils/fileType.js';

const pad = (...b) => Buffer.concat([Buffer.from(b), Buffer.alloc(40)]);
const zipWith = (marker) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(marker), Buffer.alloc(20)]);

describe('sniff', () => {
  it('identifies images by content regardless of name', () => {
    expect(sniff(pad(0xff, 0xd8, 0xff, 0xe0), 'x')?.key).toBe('jpeg');
    expect(sniff(pad(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'weird.bin')?.key).toBe('png');
    expect(sniff(Buffer.from('GIF89a' + '\0'.repeat(30), 'latin1'))?.key).toBe('gif');
    expect(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ' + '\0'.repeat(20), 'latin1'))?.key).toBe('webp');
  });
  it('identifies documents when the extension agrees', () => {
    expect(sniff(Buffer.from('%PDF-1.7\n' + 'x'.repeat(30)), 'a.pdf')?.key).toBe('pdf');
    expect(sniff(Buffer.from('plain notes here'), 'n.txt')?.key).toBe('txt');
    expect(sniff(zipWith('word/document.xml'), 'a.docx')?.key).toBe('docx');
    expect(sniff(zipWith('xl/workbook.xml'), 'a.xlsx')?.key).toBe('xlsx');
    expect(sniff(zipWith('ppt/slides'), 'a.pptx')?.key).toBe('pptx');
    expect(sniff(zipWith('anything'), 'a.zip')?.key).toBe('zip');
  });
  it('rejects mismatches and disallowed content', () => {
    expect(sniff(Buffer.from('%PDF-1.7\n' + 'x'.repeat(30)), 'a.exe')).toBeNull();      // pdf bytes, wrong extension
    expect(sniff(zipWith('anything'), 'a.exe')).toBeNull();                              // zip renamed
    expect(sniff(zipWith('anything'), 'a.docx')).toBeNull(); // fake Office (no word/ part) falls back to zip, then the extension mismatch rejects it
    expect(sniff(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(60, 1)]), 'a.png')).toBeNull(); // PE executable named .png
    expect(sniff(Buffer.alloc(100), 'a.txt')).toBeNull();                                // NUL bytes: not text
    expect(sniff(Buffer.from([1, 2]), 'a.png')).toBeNull();                              // too short
    expect(sniff(null)).toBeNull();
  });
});
