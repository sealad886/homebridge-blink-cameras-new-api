/* SPDX-License-Identifier: GPL-3.0-or-later
 * Recording-only luma motion. Fixed memory, no image output or model dependency.
 */
#define MOTION_GRID_WIDTH 64
#define MOTION_GRID_HEIGHT 36
#define MOTION_GRID_SAMPLES (MOTION_GRID_WIDTH * MOTION_GRID_HEIGHT)
#define MOTION_SAMPLE_US 200000
#define MOTION_WARMUP_US 1000000
#define MOTION_PULSE_US 1000000
#define MOTION_DELTA 20
#define MOTION_THRESHOLD_PERMILLE 20u
typedef struct {
    uint8_t baseline[MOTION_GRID_SAMPLES];
    int width, height, initialized, pending;
    int64_t started_at, sampled_at, emitted_at;
} MotionDetector;

static int motion_sample(MotionDetector *detector, const uint8_t *plane, int stride,
                         int width, int height, int64_t at_us, uint32_t *score) {
    if (!plane || width < 1 || height < 1 || stride < width || at_us < 0) return 0;
    int grid_width = width < MOTION_GRID_WIDTH ? width : MOTION_GRID_WIDTH;
    int grid_height = height < MOTION_GRID_HEIGHT ? height : MOTION_GRID_HEIGHT;
    int samples = grid_width * grid_height;
    if (detector->initialized && (at_us < detector->sampled_at ||
        detector->width != width || detector->height != height ||
        at_us - detector->sampled_at > 2000000)) memset(detector, 0, sizeof(*detector));
    if (detector->initialized && at_us - detector->sampled_at < MOTION_SAMPLE_US) return 0;
    uint8_t current[MOTION_GRID_SAMPLES];
    for (int y = 0; y < grid_height; y++) {
        int row = ((2 * y + 1) * height) / (2 * grid_height);
        for (int x = 0; x < grid_width; x++) {
            int column = ((2 * x + 1) * width) / (2 * grid_width);
            current[y * grid_width + x] = plane[row * stride + column];
        }
    }
    if (!detector->initialized) {
        memcpy(detector->baseline, current, (size_t)samples);
        detector->width = width; detector->height = height; detector->initialized = 1;
        detector->started_at = at_us; detector->sampled_at = at_us; detector->emitted_at = -1;
        return 0;
    }
    detector->sampled_at = at_us;
    if (at_us - detector->started_at < MOTION_WARMUP_US) {
        memcpy(detector->baseline, current, (size_t)samples); detector->pending = 0; return 0;
    }
    /* Median global luma shift removes uniform exposure/IR brightness changes
     * without letting a small moving foreground determine that compensation. */
    uint16_t histogram[511] = {0};
    for (int i = 0; i < samples; i++) histogram[(int)current[i] - detector->baseline[i] + 255]++;
    int bias = 0, cumulative = 0;
    for (int i = 0; i < 511; i++) {
        cumulative += histogram[i];
        if (cumulative > samples / 2) { bias = i - 255; break; }
    }
    unsigned changed = 0;
    for (int i = 0; i < samples; i++) {
        int delta = (int)current[i] - detector->baseline[i] - bias;
        if (delta >= MOTION_DELTA || delta <= -MOTION_DELTA) changed++;
    }
    *score = changed * 1000u / (unsigned)samples;
    if (*score < MOTION_THRESHOLD_PERMILLE) {
        memcpy(detector->baseline, current, (size_t)samples); detector->pending = 0; return 0;
    }
    /* Keep the pre-change reference for one confirmation. An object entering
     * and standing still still counts; a single corrupt/flash frame does not. */
    if (!detector->pending) { detector->pending = 1; return 0; }
    detector->pending = 0; memcpy(detector->baseline, current, (size_t)samples);
    if (detector->emitted_at >= 0 && at_us - detector->emitted_at < MOTION_PULSE_US) return 0;
    detector->emitted_at = at_us;
    return 1;
}
