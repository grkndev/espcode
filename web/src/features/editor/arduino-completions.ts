import type { Completion, CompletionContext, CompletionSource } from "@codemirror/autocomplete";

// frontend.plan.md §8.4 — clangd'ye gerek yok, Arduino kullanıcılarının
// %90'ının yazdığı şeyi kapsayan statik bir liste yeterli.
function fn(label: string, signature: string, detail: string): Completion {
  return { label, type: "function", detail, info: signature, apply: label };
}
function kw(label: string, detail: string): Completion {
  return { label, type: "keyword", detail };
}
function con(label: string, detail: string): Completion {
  return { label, type: "constant", detail };
}

const ARDUINO_COMPLETIONS: Completion[] = [
  // Dijital / analog I/O
  fn("pinMode", "void pinMode(uint8_t pin, uint8_t mode)", "Pin modunu ayarla"),
  fn("digitalWrite", "void digitalWrite(uint8_t pin, uint8_t value)", "Dijital pin yaz"),
  fn("digitalRead", "int digitalRead(uint8_t pin)", "Dijital pin oku"),
  fn("analogWrite", "void analogWrite(uint8_t pin, int value)", "PWM yaz"),
  fn("analogRead", "int analogRead(uint8_t pin)", "Analog pin oku (ADC)"),
  fn("analogReadResolution", "void analogReadResolution(uint8_t bits)", "ADC çözünürlüğü"),
  fn("analogWriteResolution", "void analogWriteResolution(uint8_t bits)", "PWM çözünürlüğü"),
  fn("attachInterrupt", "void attachInterrupt(uint8_t pin, void (*)(), int mode)", "Kesme bağla"),
  fn("detachInterrupt", "void detachInterrupt(uint8_t pin)", "Kesmeyi kaldır"),
  fn("pulseIn", "unsigned long pulseIn(uint8_t pin, uint8_t value)", "Darbe süresi ölç"),
  fn("tone", "void tone(uint8_t pin, unsigned int freq)", "Ton üret"),
  fn("noTone", "void noTone(uint8_t pin)", "Tonu durdur"),
  fn("shiftOut", "void shiftOut(uint8_t dataPin, uint8_t clockPin, uint8_t order, uint8_t val)", "Bit bit gönder"),
  fn("shiftIn", "uint8_t shiftIn(uint8_t dataPin, uint8_t clockPin, uint8_t order)", "Bit bit oku"),

  // Zamanlama
  fn("delay", "void delay(unsigned long ms)", "Milisaniye bekle"),
  fn("delayMicroseconds", "void delayMicroseconds(unsigned int us)", "Mikrosaniye bekle"),
  fn("millis", "unsigned long millis()", "Açılıştan bu yana geçen ms"),
  fn("micros", "unsigned long micros()", "Açılıştan bu yana geçen us"),
  fn("yield", "void yield()", "Arka plan görevlerine izin ver"),

  // Serial
  fn("Serial.begin", "void Serial.begin(unsigned long baud)", "Seri portu başlat"),
  fn("Serial.print", "void Serial.print(val)", "Yazdır"),
  fn("Serial.println", "void Serial.println(val)", "Satır sonuyla yazdır"),
  fn("Serial.printf", "void Serial.printf(const char* fmt, ...)", "Biçimli yazdır"),
  fn("Serial.write", "size_t Serial.write(uint8_t b)", "Ham bayt yaz"),
  fn("Serial.available", "int Serial.available()", "Okunabilir bayt sayısı"),
  fn("Serial.read", "int Serial.read()", "Bir bayt oku"),
  fn("Serial.readString", "String Serial.readString()", "Gelen veriyi String olarak oku"),
  fn("Serial.readStringUntil", "String Serial.readStringUntil(char terminator)", "Belirteçe kadar oku"),
  fn("Serial.parseInt", "long Serial.parseInt()", "Sayı ayrıştır"),
  fn("Serial.flush", "void Serial.flush()", "Çıkış tamponunu boşalt"),
  fn("Serial.setDebugOutput", "void Serial.setDebugOutput(bool en)", "Hata ayıklama çıktısı"),

  // WiFi (ESP32)
  fn("WiFi.begin", "void WiFi.begin(const char* ssid, const char* pass)", "WiFi'a bağlan"),
  fn("WiFi.status", "wl_status_t WiFi.status()", "Bağlantı durumu"),
  fn("WiFi.localIP", "IPAddress WiFi.localIP()", "Yerel IP"),
  fn("WiFi.macAddress", "String WiFi.macAddress()", "MAC adresi"),
  fn("WiFi.RSSI", "int32_t WiFi.RSSI()", "Sinyal gücü"),
  fn("WiFi.disconnect", "void WiFi.disconnect()", "Bağlantıyı kes"),
  fn("WiFi.mode", "void WiFi.mode(wifi_mode_t mode)", "WIFI_STA / WIFI_AP / WIFI_AP_STA"),
  fn("WiFi.softAP", "bool WiFi.softAP(const char* ssid, const char* pass)", "Erişim noktası aç"),
  fn("WiFi.scanNetworks", "int16_t WiFi.scanNetworks()", "Ağları tara"),

  // millis tabanlı zamanlayıcı, EEPROM, Preferences (ESP32 kalıcı depolama)
  fn("Preferences.begin", "bool Preferences.begin(const char* name, bool readOnly)", "NVS namespace aç"),
  fn("Preferences.putInt", "size_t Preferences.putInt(const char* key, int32_t value)", "Değer yaz"),
  fn("Preferences.getInt", "int32_t Preferences.getInt(const char* key, int32_t def)", "Değer oku"),
  fn("Preferences.end", "void Preferences.end()", "Namespace'i kapat"),

  // Matematik
  fn("map", "long map(long x, long in_min, long in_max, long out_min, long out_max)", "Aralık dönüştür"),
  fn("constrain", "x constrain(x, a, b)", "Değeri sınırla"),
  fn("min", "x min(a, b)", "Küçüğü al"),
  fn("max", "x max(a, b)", "Büyüğü al"),
  fn("abs", "x abs(x)", "Mutlak değer"),
  fn("pow", "double pow(double base, double exp)", "Üs al"),
  fn("sqrt", "double sqrt(double x)", "Karekök"),
  fn("random", "long random(long max)", "Rastgele sayı"),
  fn("randomSeed", "void randomSeed(unsigned long seed)", "Rastgele tohum"),

  // Fonksiyon iskeletleri
  fn("setup", "void setup()", "Bir kez çalışır"),
  fn("loop", "void loop()", "Sürekli çalışır"),

  // Tipler / anahtar kelimeler
  kw("void", "Tip: değer döndürmez"),
  kw("int", "Tip: 32-bit tam sayı"),
  kw("float", "Tip: kayan noktalı sayı"),
  kw("double", "Tip: çift hassasiyetli kayan nokta"),
  kw("bool", "Tip: true/false"),
  kw("byte", "Tip: 8-bit işaretsiz"),
  kw("char", "Tip: tek karakter"),
  kw("String", "Tip: Arduino string sınıfı"),
  kw("uint8_t", "Tip: 8-bit işaretsiz tam sayı"),
  kw("uint16_t", "Tip: 16-bit işaretsiz tam sayı"),
  kw("uint32_t", "Tip: 32-bit işaretsiz tam sayı"),
  kw("const", "Değiştirilemez"),
  kw("static", "Statik depolama süresi"),
  kw("volatile", "Kesme içinde değişebilir"),
  kw("if", "Koşul"),
  kw("else", "Alternatif koşul"),
  kw("for", "Sayaçlı döngü"),
  kw("while", "Koşullu döngü"),
  kw("do", "Do-while döngüsü"),
  kw("switch", "Çoklu dallanma"),
  kw("case", "Switch dalı"),
  kw("break", "Döngü/switch'ten çık"),
  kw("continue", "Sonraki adıma geç"),
  kw("return", "Fonksiyondan dön"),
  kw("struct", "Yapı tanımı"),
  kw("class", "Sınıf tanımı"),

  // Sabitler
  con("HIGH", "Dijital yüksek seviye (1)"),
  con("LOW", "Dijital düşük seviye (0)"),
  con("INPUT", "Pin modu: giriş"),
  con("OUTPUT", "Pin modu: çıkış"),
  con("INPUT_PULLUP", "Pin modu: dahili pull-up ile giriş"),
  con("LED_BUILTIN", "Kart üzerindeki LED pini"),
  con("true", "Boolean doğru"),
  con("false", "Boolean yanlış"),
  con("PI", "3.14159265358979323846"),
  con("WIFI_STA", "WiFi modu: istasyon"),
  con("WIFI_AP", "WiFi modu: erişim noktası"),
];

const arduinoCompletionSource: CompletionSource = (context: CompletionContext) => {
  const word = context.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: ARDUINO_COMPLETIONS,
    validFor: /^[\w.]*$/,
  };
};

export default arduinoCompletionSource;
