// Local ZIP32 writer, STORE method: images are already compressed. No CDN or dependencies.
const TABLE = Uint32Array.from({length:256}, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
const LIMIT = 512 * 1024 * 1024;
export class ZipArchive {
  constructor() { this.parts = []; this.entries = []; this.offset = 0; }
  async add(name, blob, signal) {
    if (this.offset + blob.size + 1024 > LIMIT) throw Error('El ZIP supera 512 MB. Divide el lote o elige JPG/WebP.');
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let crc = 0xffffffff;
    for (let start = 0; start < bytes.length; start += 1024 * 1024) {
      signal?.throwIfAborted();
      for (let i = start; i < Math.min(bytes.length, start + 1024 * 1024); i++) crc = TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    const filename = new TextEncoder().encode(name);
    const header = new Uint8Array(30 + filename.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // UTF-8 filenames
    view.setUint16(12, 33, true); // 1980-01-01, deterministic DOS date
    view.setUint32(14, (crc ^ 0xffffffff) >>> 0, true);
    view.setUint32(18, blob.size, true); view.setUint32(22, blob.size, true);
    view.setUint16(26, filename.length, true); header.set(filename, 30);
    this.entries.push({header, filename, offset:this.offset});
    this.parts.push(header, blob);
    this.offset += header.length + blob.size;
  }
  finish() {
    const central = this.entries.map(({header, filename, offset}) => {
      const record = new Uint8Array(46 + filename.length), view = new DataView(record.buffer);
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true);
      record.set(header.subarray(4, 30), 6);
      view.setUint32(42, offset, true); record.set(filename, 46);
      return record;
    });
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, this.entries.length, true); view.setUint16(10, this.entries.length, true);
    view.setUint32(12, central.reduce((sum, item) => sum + item.length, 0), true);
    view.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...central, end], {type:'application/zip'});
  }
}
