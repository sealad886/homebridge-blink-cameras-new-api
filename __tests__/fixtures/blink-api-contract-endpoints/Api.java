package test;
import left.Keys;
import static left.Keys.KEY;
interface Api {
  String LOCAL = "local";
  @GET("same") Single<ReplyA> rx(@Query("q") String first);
  @GET("same") Object coroutine(@Query("q") String renamed, Continuation<? super ReplyA> continuation);
  @GET("same") Single<ReplyB> alternate(@Query("q") String first);
  @GET("same") Single<List<ReplyA>> collection(@Query("q") String first);
  @GET("names") Single<ReplyA> names(@Query(value = Keys.KEY, encoded = true) String a, @Query(right.Keys.KEY) String b, @Header(KEY) String c, @Field(LOCAL) String d, @Query(left.Keys.EMPTY) String e, @Query(Unknown.KEY) String f);
  @GET("path/{first}/{second}") Single<ReplyA> path(@Path(Unknown.A) String second, @Path(Unknown.B) String first);
}
