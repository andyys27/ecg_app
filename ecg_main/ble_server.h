#pragma once
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// UUIDs estandar para serial sobre BLE 
#define SERVICE_UUID        "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

static BLECharacteristic* pCharacteristic = nullptr;
static bool bleConnected = false;

// Callbacks de conexion/desconexion
class BLECallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* s) override {
        bleConnected = true;
        Serial.println("[BLE] Cliente conectado");
    }
    void onDisconnect(BLEServer* s) override {
        bleConnected = false;
        Serial.println("[BLE] Cliente desconectado — reiniciando advertising");
        s->startAdvertising();
    }
};

void bleBegin(const char* deviceName) {
    BLEDevice::init(deviceName);
    BLEServer* pServer = BLEDevice::createServer();
    pServer->setCallbacks(new BLECallbacks());

    BLEService* pService = pServer->createService(SERVICE_UUID);

    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pCharacteristic->addDescriptor(new BLE2902());

    pService->start();

    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->start();

    Serial.print("[BLE] Anunciando como: ");
    Serial.println(deviceName);
}

// Envia string al cliente BLE conectado
void bleSend(const char* msg) {
    if (!bleConnected || pCharacteristic == nullptr) return;
    pCharacteristic->setValue((uint8_t*)msg, strlen(msg));
    pCharacteristic->notify();
}

bool bleIsConnected() { return bleConnected; }