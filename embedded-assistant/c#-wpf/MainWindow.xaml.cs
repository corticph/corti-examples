using CortiAssistantApp.Services;
using Microsoft.Web.WebView2.Core;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;

namespace CortiAssistantApp
{
    public partial class MainWindow : Window
    {
        private const string LocalHostOrigin = "https://corti.local";

        private readonly CortiSettings _settings = null!;
        private readonly CortiAuthService _authService = null!;
        private readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        private AuthTokens _authTokens = null!;
        private TaskCompletionSource<bool>? _bootstrapPending;
        private BootstrapMessage? _pendingBootstrapMessage;

        public MainWindow()
        {
            InitializeComponent();

            try
            {
                _settings = CortiSettings.LoadFromProjectEnv();
                _authService = new CortiAuthService(_settings);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Configuration Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
                return;
            }

            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            Loaded -= MainWindow_Loaded;
            await InitializeWebViewAsync();
        }

        private async Task InitializeWebViewAsync()
        {
            try
            {
                var userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "CortiAssistantApp",
                    "WebView2"
                );

                var environment = await CoreWebView2Environment.CreateAsync(
                    null,
                    userDataFolder,
                    new CoreWebView2EnvironmentOptions
                    {
                        AdditionalBrowserArguments = "--enable-features=WebRTC " +
                                                    "--enable-media-stream " +
                                                    "--autoplay-policy=no-user-gesture-required"
                    }
                );

                await CortiWebView.EnsureCoreWebView2Async(environment);

                var webAssetsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "WebAssets");
                var webAssetsIndexPath = Path.Combine(webAssetsPath, "index.html");
                if (!File.Exists(webAssetsIndexPath))
                {
                    throw new FileNotFoundException(
                        "Built WebAssets were not found. Run 'npm install' and 'npm run build' in the WebAssets folder, then rebuild the WPF app.",
                        webAssetsIndexPath
                    );
                }

                CortiWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "corti.local",
                    webAssetsPath,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                CortiWebView.CoreWebView2.Settings.AreDevToolsEnabled =
#if DEBUG
                        true;
#else
                        false;
#endif
                CortiWebView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = false;
                CortiWebView.CoreWebView2.Settings.IsWebMessageEnabled = true;
                CortiWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                CortiWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                CortiWebView.CoreWebView2.PermissionRequested += CoreWebView2_PermissionRequested;
                CortiWebView.CoreWebView2.WebMessageReceived += WebView_WebMessageReceived;

                AuthButton.IsEnabled = true;
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "WebView Initialization Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void AuthButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                AuthButton.IsEnabled = false;
                AuthButton.Content = "Authenticating...";

                _authTokens = await _authService.AuthenticateAsync();
                await LoadCortiAssistant();

                AuthButton.Visibility = Visibility.Collapsed;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Authentication failed: {ex.Message}", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                AuthButton.IsEnabled = true;
                AuthButton.Content = "Authenticate";
            }
        }

        private async Task LoadCortiAssistant()
        {
            if (CortiWebView.CoreWebView2 is null)
            {
                throw new InvalidOperationException("WebView2 is not ready yet.");
            }

            var navigationCompleted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            _bootstrapPending = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            _pendingBootstrapMessage = new BootstrapMessage
            {
                AccessToken = _authTokens.AccessToken,
                RefreshToken = _authTokens.RefreshToken,
                IdToken = _authTokens.IdToken,
                TokenType = _authTokens.JsonTokenType,
                ExpiresIn = _authTokens.ExpiresIn,
                BaseUrl = $"https://assistant.{_settings.EnvironmentName}.corti.app"
            };

            void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
            {
                navigationCompleted.TrySetResult(e.IsSuccess);
            }

            try
            {
                CortiWebView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
                CortiWebView.CoreWebView2.Navigate("https://corti.local/index.html");

                var success = await navigationCompleted.Task;
                if (!success)
                {
                    throw new Exception("Failed to load the Corti Assistant page.");
                }

                var bootstrapCompleted = await Task.WhenAny(_bootstrapPending.Task, Task.Delay(TimeSpan.FromSeconds(10)));
                if (bootstrapCompleted != _bootstrapPending.Task || !_bootstrapPending.Task.Result)
                {
                    throw new TimeoutException("Timed out waiting for the embedded page to request bootstrap data.");
                }
            }
            finally
            {
                CortiWebView.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
                _pendingBootstrapMessage = null;
                _bootstrapPending = null;
            }
        }

        private void CoreWebView2_PermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs args)
        {
            if (args.PermissionKind == CoreWebView2PermissionKind.Microphone &&
                IsTrustedMicrophoneOrigin(args.Uri))
            {
                args.State = CoreWebView2PermissionState.Allow;
                return;
            }

            args.State = CoreWebView2PermissionState.Deny;
        }

        private bool IsTrustedMicrophoneOrigin(string? uri)
        {
            if (string.IsNullOrWhiteSpace(uri))
            {
                return false;
            }

            if (!Uri.TryCreate(uri, UriKind.Absolute, out var requestUri))
            {
                return false;
            }

            var origin = requestUri.GetLeftPart(UriPartial.Authority);
            if (string.Equals(origin, LocalHostOrigin, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var assistantOrigin = $"https://assistant.{_settings.EnvironmentName}.corti.app";
            return string.Equals(origin, assistantOrigin, StringComparison.OrdinalIgnoreCase);
        }

        private void WebView_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            var message = e.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            var eventData = JsonSerializer.Deserialize<HostMessage>(message, _jsonOptions);
            if (eventData is not null)
            {
                HandleHostMessage(eventData);
            }
        }

        private void HandleHostMessage(HostMessage eventData)
        {
            switch (eventData.Type)
            {
                case "host.ready":
                    if (CortiWebView.CoreWebView2 is not null && _pendingBootstrapMessage is not null)
                    {
                        CortiWebView.CoreWebView2.PostWebMessageAsJson(
                            JsonSerializer.Serialize(_pendingBootstrapMessage, _jsonOptions)
                        );
                        _bootstrapPending?.TrySetResult(true);
                    }
                    break;
                case "session.started":
                    break;
                case "error":
                    var errorMessage = eventData.Payload.ValueKind == JsonValueKind.String
                        ? eventData.Payload.GetString()
                        : eventData.Payload.GetRawText();
                    MessageBox.Show($"Error: {errorMessage}", "Assistant Error");
                    break;
            }
        }

        private sealed class HostMessage
        {
            [JsonPropertyName("type")]
            public string Type { get; set; } = string.Empty;

            [JsonPropertyName("payload")]
            public JsonElement Payload { get; set; }
        }

        private sealed class BootstrapMessage
        {
            [JsonPropertyName("access_token")]
            public string AccessToken { get; set; } = string.Empty;

            [JsonPropertyName("refresh_token")]
            public string RefreshToken { get; set; } = string.Empty;

            [JsonPropertyName("id_token")]
            public string IdToken { get; set; } = string.Empty;

            [JsonPropertyName("token_type")]
            public string TokenType { get; set; } = string.Empty;

            [JsonPropertyName("expires_in")]
            public int ExpiresIn { get; set; }

            [JsonPropertyName("baseUrl")]
            public string BaseUrl { get; set; } = string.Empty;
        }
    }
}
