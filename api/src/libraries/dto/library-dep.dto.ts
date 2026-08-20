import { IsString, Matches } from 'class-validator';

// downloads.arduino.cc/libraries/library_index.json'daki 9865 kütüphanenin
// tamamı bu iki desenle eşleşiyor (canlı doğrulandı) — reddetme riski yok,
// ama uydurma/enjeksiyon amaçlı bir isim/sürüm worker.js'e asla çıplak
// ulaşmaz (bkz. compile-request.dto.ts, build-key.ts).
const LIBRARY_NAME_RE = /^[\w .+-]{1,64}$/;
const LIBRARY_VERSION_RE = /^[\w.+-]{1,32}$/;

export class LibraryDepDto {
  @IsString()
  @Matches(LIBRARY_NAME_RE, { message: 'invalid_library_name' })
  name: string;

  @IsString()
  @Matches(LIBRARY_VERSION_RE, { message: 'invalid_library_version' })
  version: string;
}
