import { recognizeTextWithMlKit } from '@/services/scan/ocr';

jest.mock('@react-native-ml-kit/text-recognition', () => {
  return {
    __esModule: true,
    default: {
      recognize: jest.fn(),
    },
  };
});

describe('OCR ordering', () => {
  it('orders lines top-to-bottom and merges same-row fragments', async () => {
    const TextRecognition = require('@react-native-ml-kit/text-recognition').default;

    // Intentionally scrambled order: address appears after item, "VISA" appears between items.
    TextRecognition.recognize.mockResolvedValue({
      text: 'ITEM A\nVISA\nADDR 1\n19.99\nITEM B',
      blocks: [
        {
          lines: [
            { text: 'ITEM A', frame: { left: 10, top: 100, right: 120, bottom: 110 } },
            { text: 'VISA', frame: { left: 10, top: 180, right: 60, bottom: 190 } },
            { text: 'ADDR 1', frame: { left: 10, top: 20, right: 120, bottom: 30 } },
            // Price fragment on same visual row as ITEM A.
            { text: '19.99', frame: { left: 220, top: 100, right: 270, bottom: 110 } },
            { text: 'ITEM B', frame: { left: 10, top: 140, right: 120, bottom: 150 } },
          ],
        },
      ],
    });

    const out = await recognizeTextWithMlKit('file:///tmp/receipt.jpg');

    expect(out.text).toBe('ADDR 1\nITEM A 19.99\nITEM B\nVISA');
    expect(out.layout?.lines.map((l) => l.text)).toEqual(['ADDR 1', 'ITEM A 19.99', 'ITEM B', 'VISA']);
  });
});
