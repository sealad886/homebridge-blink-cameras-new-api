package use;
import test.Api;
class Caller {
  public Object load(Api api, String query) {
    Object response = api.rx(query);
    return response;
  }
}
