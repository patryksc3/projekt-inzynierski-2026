namespace VideoPresenterApi.Services;

public interface IDevicePairCodeStore
{
    string Create(Guid deviceId);

    bool TryConsume(string code, out Guid deviceId);
}
