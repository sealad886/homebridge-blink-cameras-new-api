/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "../motion.inc"
#define WIDTH 64
#define HEIGHT 36
#define CHECK(value) do { if (!(value)) { fprintf(stderr,"motion check line %d\n",__LINE__); return 2; } } while(0)
static void image(uint8_t *pixels, int brightness, int patch) {
    memset(pixels,brightness,WIDTH*HEIGHT);
    if(patch>=0)for(int y=10;y<24;y++)for(int x=patch;x<patch+12;x++)pixels[y*WIDTH+x]=200;
}
static int sample(MotionDetector *detector,uint8_t *pixels,int tick,uint32_t *score) {
    return motion_sample(detector,pixels,WIDTH,WIDTH,HEIGHT,(int64_t)tick*200000,score);
}
int main(void) {
    uint8_t pixels[WIDTH*HEIGHT];uint32_t score=0;MotionDetector detector={0};
    CHECK(sizeof(detector)<4096);
    image(pixels,40,-1);
    for(int i=0;i<30;i++)CHECK(!sample(&detector,pixels,i,&score));
    memset(&detector,0,sizeof(detector));
    for(int i=0;i<30;i++) {
        for(int j=0;j<WIDTH*HEIGHT;j++)pixels[j]=(uint8_t)(40+(i+j)%13-6);
        CHECK(!sample(&detector,pixels,i,&score));
    }
    memset(&detector,0,sizeof(detector));
    for(int i=0;i<30;i++) { image(pixels,40+(i%3)*40,-1);CHECK(!sample(&detector,pixels,i,&score)); }
    memset(&detector,0,sizeof(detector));
    for(int i=0;i<20;i++) { image(pixels,40,i==10?10:-1);CHECK(!sample(&detector,pixels,i,&score)); }
    memset(&detector,0,sizeof(detector));int arriving=0;
    for(int i=0;i<30;i++) {
        image(pixels,40,i>=10?10:-1);
        if(sample(&detector,pixels,i,&score)) { arriving++;CHECK(i>=11 && score>=20 && score<=1000); }
    }
    CHECK(arriving==1);
    memset(&detector,0,sizeof(detector));int moving=0,last=-10;
    for(int i=0;i<40;i++) {
        image(pixels,40,i>=10?((i/2)%2?10:36):-1);
        if(sample(&detector,pixels,i,&score)) { moving++;CHECK(i>=6 && i-last>=5);last=i; }
    }
    CHECK(moving>=3);
    image(pixels,40,-1);
    for(int i=0;i<15;i++)CHECK(!sample(&detector,pixels,i,&score));
    printf("{\"checks\":7,\"stateBytes\":%zu}\n",sizeof(detector));return 0;
}
