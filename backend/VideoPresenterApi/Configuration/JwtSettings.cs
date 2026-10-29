namespace VideoPresenterApi.Configuration;

public sealed class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = string.Empty;

    public string Audience { get; set; } = string.Empty;

    // Base64-encoded secret; keep it in user-secrets or deployment secrets.
    public string SigningKey { get; set; } = string.Empty;
}
