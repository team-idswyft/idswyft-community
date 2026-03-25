/** A single OCR line with spatial metadata */
export interface FlatLine {
  text:       string;
  confidence: number;
  y:          number;   // vertical center of bounding box
  x:          number;   // horizontal left edge
  width:      number;   // bounding box width
}

/** Name extraction result */
export type NameResult = { value: string; confidence: number };

/** A FlatLine annotated with its position in the line array */
export type LabelMapEntry = FlatLine & { lineIndex: number };
