.class public interface abstract Lcom/immediasemi/blink/test/SmaliOnlyApi;
.super Ljava/lang/Object;

.method public abstract fetch(Ljava/lang/String;)Ljava/lang/Object;
    .param p1
        .annotation runtime Lretrofit2/http/Url;
        .end annotation
    .end param
    .annotation runtime Lretrofit2/http/GET;
    .end annotation
.end method

.method public abstract remove()Ljava/lang/Object;
    .annotation runtime Lretrofit2/http/DELETE;
        value = "v1/device/remove"
    .end annotation
.end method
