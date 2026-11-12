using System.Text.Json.Serialization;

namespace VideoPresenterApi.Contracts;

public sealed record LoginResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_at")] DateTimeOffset ExpiresAt);
