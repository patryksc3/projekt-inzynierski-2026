namespace VideoPresenterApi.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Login { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;
}
