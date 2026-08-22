// Generic "ESP32 Dev Module" (esp32:esp32:esp32) core variants don't define
// LED_BUILTIN — this sketch only exists to warm the core.a build cache, the
// pin doesn't need to be real.
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
