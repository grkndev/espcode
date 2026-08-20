// window.location.href ile tam sayfa navigasyonu yerine — bazı ortamlarda
// (ör. otomasyon/uzantı denetimli oturumlar) indirmeyi tetikleyen
// navigasyonlar sessizce engellenebiliyor; blob + geçici <a download> DOM
// üzerinde sıradan bir tıklama olduğu için bu sorunu yaşamıyor, ayrıca
// başarısızlığı (fetch reddi/hata durum kodu) çağıranın yakalayıp
// toast'layabilmesini sağlıyor.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
