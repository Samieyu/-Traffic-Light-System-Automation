/*#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <PCF8574.h>

// ============ CONFIG ============
const char* ssid     = "Rex";      // <--- CHANGE THIS
const char* password = "87654327";  // <--- CHANGE THIS

// I2C Relay Modules (First 8 relays at 0x20, Next 8 at 0x21)
PCF8574 relay1(0x20); 
PCF8574 relay2(0x21);

// Relay Mapping for 4 Directions (0-indexed)
const int N_RED = 0; const int N_YEL = 1; const int N_GRN = 2;
const int S_RED = 3; const int S_YEL = 4; const int S_GRN = 5;
const int E_RED = 6; const int E_YEL = 7; const int E_GRN = 8;
const int W_RED = 9; const int W_YEL = 10; const int W_GRN = 11;

// State Variables
String  mode = "fixed";
int     countdown = 0;
int     fixedRed = 30;
int     fixedYellow = 5;
int     fixedGreen = 30;
int     maxEmergencySec = 60;
unsigned long emergencyStart = 0;
int     phase = 0;
unsigned long phaseStart = 0;

WebServer server(80);

// ============ HELPERS ============
// Relays are typically "Active LOW". LOW turns the relay ON, HIGH turns it OFF.
void writeRelay(int pin, bool on) {
  int state = on ? LOW : HIGH;
  if (pin < 8) relay1.write(pin, state);
  else         relay2.write(pin - 8, state);
}

void setDirection(String dir, String color) {
  int rPin = 0, yPin = 0, gPin = 0;
  if (dir == "N") { rPin = N_RED; yPin = N_YEL; gPin = N_GRN; }
  else if (dir == "S") { rPin = S_RED; yPin = S_YEL; gPin = S_GRN; }
  else if (dir == "E") { rPin = E_RED; yPin = E_YEL; gPin = E_GRN; }
  else if (dir == "W") { rPin = W_RED; yPin = W_YEL; gPin = W_GRN; }

  bool rOn = (color == "red"); 
  bool yOn = (color == "yellow"); 
  bool gOn = (color == "green");
  
  writeRelay(rPin, rOn); 
  writeRelay(yPin, yOn); 
  writeRelay(gPin, gOn);
}

void startPhase(int newPhase) {
  phase = newPhase;
  phaseStart = millis();
  
  if (phase == 0) { // North & South Green, East & West Red
    setDirection("N", "green"); setDirection("S", "green");
    setDirection("E", "red"); setDirection("W", "red");
    countdown = fixedGreen;
  } else if (phase == 1) { // North & South Yellow, East & West Red
    setDirection("N", "yellow"); setDirection("S", "yellow");
    setDirection("E", "red"); setDirection("W", "red");
    countdown = fixedYellow;
  } else if (phase == 2) { // North & South Red, East & West Green
    setDirection("N", "red"); setDirection("S", "red");
    setDirection("E", "green"); setDirection("W", "green");
    countdown = fixedGreen;
  } else if (phase == 3) { // North & South Red, East & West Yellow
    setDirection("N", "red"); setDirection("S", "red");
    setDirection("E", "yellow"); setDirection("W", "yellow");
    countdown = fixedYellow;
  }
}

// ============ HTTP HANDLERS ============
void handleStatus() {
  StaticJsonDocument<300> doc;
  doc["mode"] = mode;
  doc["countdown"] = countdown;
  doc["phase"] = phase; 
  String out; serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleMode() {
  if (!server.hasArg("mode")) { server.send(400, "text/plain", "missing mode"); return; }
  String m = server.arg("mode");
  
  if (m == "fixed") {
    mode = "fixed"; startPhase(0); 
    server.send(200, "text/plain", "OK fixed");
  } else if (m == "emergency") {
    mode = "emergency"; emergencyStart = millis(); 
    // Emergency: All Red except the requested direction
    if (server.hasArg("dir")) {
      String dir = server.arg("dir");
      setDirection("N", "red"); setDirection("S", "red"); 
      setDirection("E", "red"); setDirection("W", "red");
      setDirection(dir, "green");
    }
    server.send(200, "text/plain", "OK emergency");
  } else if (m == "manual") {
    mode = "manual"; server.send(200, "text/plain", "OK manual");
  } else server.send(400, "text/plain", "bad mode");
}

void handleControl() {
  if (!server.hasArg("dir") || !server.hasArg("color")) { server.send(400, "text/plain", "missing args"); return; }
  setDirection(server.arg("dir"), server.arg("color"));
  server.send(200, "text/plain", "OK");
}

void handleConfig() {
  if (server.hasArg("red"))          fixedRed = server.arg("red").toInt();
  if (server.hasArg("yellow"))       fixedYellow = server.arg("yellow").toInt();
  if (server.hasArg("green"))        fixedGreen = server.arg("green").toInt();
  if (server.hasArg("maxEmergency")) maxEmergencySec = server.arg("maxEmergency").toInt();
  server.send(200, "text/plain", "OK config");
}

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // Start I2C on GPIO 21 (SDA) and 22 (SCL)
  
  // Initialize Relays (set all OFF initially)
  relay1.begin(); relay2.begin();
  for(int i=0; i<8; i++) { relay1.write(i, HIGH); relay2.write(i, HIGH); }

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nESP32 IP: " + WiFi.localIP().toString());
  Serial.println("Copy this IP and paste it into server.js!");

  server.on("/status",  handleStatus);
  server.on("/control", handleControl);
  server.on("/mode",    handleMode);
  server.on("/config",  handleConfig);
  server.begin();

  startPhase(0); // Start in Phase 0 (North/South Green)
}

// ============ LOOP ============
void loop() {
  server.handleClient();
  unsigned long now = millis();

  if (mode == "fixed") {
    if (now - phaseStart >= 1000) {
      phaseStart = now;
      if (countdown > 0) countdown--;
      if (countdown == 0) startPhase((phase + 1) % 4);
    }
  } else if (mode == "emergency") {
    if (now - emergencyStart >= (unsigned long)maxEmergencySec * 1000UL) {
      mode = "fixed"; startPhase(0); // Auto return to normal
    }
  }
}*/