using System.Net.Http;
using System.Text.Json;

namespace CortiAssistantApp.Services
{
    internal sealed class CortiAuthService
    {
        private readonly CortiSettings _settings;
        private readonly HttpClient _httpClient;

        public CortiAuthService(CortiSettings settings)
        {
            _settings = settings;
            _httpClient = new HttpClient();
        }

        public string GetAuthUrl()
        {
            return $"https://auth.{_settings.EnvironmentName}.corti.app/realms/{_settings.TenantName}/protocol/openid-connect";
        }

        public async Task<AuthTokens> AuthenticateAsync()
        {
            var tokenUrl = $"{GetAuthUrl()}/token";

            var content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("grant_type", "password"),
                new KeyValuePair<string, string>("client_id", _settings.ClientId),
                new KeyValuePair<string, string>("username", _settings.UserEmail),
                new KeyValuePair<string, string>("password", _settings.UserPassword),
                new KeyValuePair<string, string>("scope", "openid")
            });

            var response = await _httpClient.PostAsync(tokenUrl, content);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"Authentication failed: {responseBody}");
            }

            var tokenResponse = JsonSerializer.Deserialize<TokenResponse>(
                responseBody,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );

            if (tokenResponse is null ||
                string.IsNullOrWhiteSpace(tokenResponse.access_token) ||
                string.IsNullOrWhiteSpace(tokenResponse.refresh_token) ||
                string.IsNullOrWhiteSpace(tokenResponse.token_type))
            {
                throw new Exception("Authentication failed: token response was missing required fields.");
            }

            return new AuthTokens
            {
                AccessToken = tokenResponse.access_token,
                RefreshToken = tokenResponse.refresh_token,
                IdToken = tokenResponse.id_token,
                JsonTokenType = tokenResponse.token_type,
                ExpiresIn = tokenResponse.expires_in,
            };
        }

        private sealed class TokenResponse
        {
            public string access_token { get; set; } = string.Empty;
            public string refresh_token { get; set; } = string.Empty;
            public string id_token { get; set; } = string.Empty;
            public string token_type { get; set; } = string.Empty;
            public int expires_in { get; set; }
        }
    }

    public sealed class AuthTokens
    {
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public string IdToken { get; set; } = string.Empty;
        public string JsonTokenType { get; set; } = string.Empty;
        public int ExpiresIn { get; set; }
    }
}
