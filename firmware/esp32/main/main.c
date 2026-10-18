/* FirmaChain ESP32-S3 USB serial prototype.
 * Sends a JSON report over the USB Serial/JTAG console. A PC-side bridge reads
 * these lines and forwards them to the FirmaChain HTTPS API.
 * IMPORTANT: this is a prototype, not hardware-backed remote attestation.
 */
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_app_desc.h"
#include "esp_chip_info.h"
#include "esp_partition.h"
#include "esp_ota_ops.h"
#include "esp_system.h"
#include "esp_mac.h"
#include "mbedtls/sha256.h"

#define DEVICE_ID "esp32-s3-usb-01"
static char hex_hash[65];

static void hash_running_partition(void)
{
    const esp_partition_t *p = esp_ota_get_running_partition();
    unsigned char digest[32];
    if (!p || esp_partition_get_sha256(p, digest) != ESP_OK) {
        strcpy(hex_hash, "");
        return;
    }
    for (int i = 0; i < 32; ++i) sprintf(&hex_hash[i * 2], "%02x", digest[i]);
    hex_hash[64] = '\0';
}

void app_main(void)
{
    const esp_app_desc_t *app = esp_app_get_description();
    char version[33] = "unknown";
    if (app) snprintf(version, sizeof(version), "%s", app->version);
    hash_running_partition();

    /* Keep stdout available as the USB Serial/JTAG console in the ESP-IDF
       configuration. Disable or redirect verbose logs if they interfere. */
    while (1) {
        printf("{\"type\":\"firmachain_report\",\"device_id\":\"%s\",\"firmware_version\":\"%s\",\"firmware_hash\":\"%s\",\"security_violation\":false,\"note\":\"ESP32-S3 USB serial prototype report; not remote attestation\"}\n",
               DEVICE_ID, version, hex_hash);
        fflush(stdout);
        vTaskDelay(pdMS_TO_TICKS(15000));
    }
}
