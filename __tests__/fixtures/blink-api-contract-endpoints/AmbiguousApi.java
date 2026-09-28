package test;
import static left.Keys.*;
import static right.Keys.*;
interface AmbiguousApi {
  @GET("ambiguous") Single<ReplyA> ambiguous(@Query(KEY) String value);
}
