namespace VideoPresenterApi.Models;

public class Device
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public string CredentialHash { get; set; } = string.Empty;
}
