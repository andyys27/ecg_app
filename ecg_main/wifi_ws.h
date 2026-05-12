#pragma once
#include <WiFi.h>
#include <WebSocketsServer.h>

// WiFi and WebSocket server configuration
static const char* WIFI_SSID     = "TU_RED_WIFI";
static const char* WIFI_PASSWORD = "TU_CONTRASENA";

// WebSocket server port
static const uint16_t WS_PORT = 81;

// WebSocket server instance
WebSocketsServer wsServer(WS_PORT);

// Function to initialize WiFi and WebSocket server
void wifiWsBegin() {
    Serial.print("[WiFi] Connecting to ");
    Serial.println(WIFI_SSID);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(400);
        Serial.print(".");
    }

    Serial.println();
    Serial.print("[WiFi] Connected. IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WS]   Server at ws://");
    Serial.print(WiFi.localIP());
    Serial.print(":");
    Serial.println(WS_PORT);

    wsServer.begin();
}

// Function to handle WebSocket client connections and messages
void wifiWsLoop() {
    wsServer.loop();
}

// Function to broadcast a message to all connected WebSocket clients
void wsBroadcast(const char* msg) {
    wsServer.broadcastTXT(msg);
}