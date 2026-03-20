using CortiAssistantApp.Services;
using Microsoft.Web.WebView2.Core;
using System.IO;
using System.Text.Json;
using System.Windows;

namespace CortiAssistantApp
{
    public partial class MainWindow : Window
    {
        private readonly CortiSettings _settings = null!;
        private readonly CortiAuthService _authService = null!;
        private AuthTokens _authTokens = null!;

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

            InitializeWebView();
        }

        private async void InitializeWebView()
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
                                                    "--use-fake-ui-for-media-stream " +
                                                    "--autoplay-policy=no-user-gesture-required"
                    }
                );

                await CortiWebView.EnsureCoreWebView2Async(environment);

                var webAssetsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "WebAssets");
                CortiWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "corti.local",
                    webAssetsPath,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                CortiWebView.CoreWebView2.Settings.AreDevToolsEnabled = true;
                CortiWebView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
                CortiWebView.CoreWebView2.Settings.IsWebMessageEnabled = true;
                CortiWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                CortiWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;

                CortiWebView.CoreWebView2.PermissionRequested += (_, args) =>
                {
                    if (args.PermissionKind == CoreWebView2PermissionKind.Microphone ||
                        args.PermissionKind == CoreWebView2PermissionKind.Camera)
                    {
                        args.State = CoreWebView2PermissionState.Allow;
                    }
                };

                CortiWebView.CoreWebView2.WebMessageReceived += WebView_WebMessageReceived;
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
            var navigationCompleted = new TaskCompletionSource<bool>();

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

                await Task.Delay(500);

                var authJson = JsonSerializer.Serialize(new
                {
                    access_token = _authTokens.AccessToken,
                    refresh_token = _authTokens.RefreshToken,
                    id_token = _authTokens.IdToken,
                    token_type = _authTokens.JsonTokenType,
                    expires_in = _authTokens.ExpiresIn,
                    baseUrl = $"https://assistant.{_settings.EnvironmentName}.corti.app"
                });

                await CortiWebView.CoreWebView2.ExecuteScriptAsync(
                    $"window.initializeCorti({authJson});"
                );
            }
            finally
            {
                CortiWebView.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
            }
        }

        private void WebView_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            var message = e.TryGetWebMessageAsString();

            var eventData = JsonSerializer.Deserialize<HostMessage>(message);
            if (eventData is not null)
            {
                HandleHostMessage(eventData);
            }
        }

        private void HandleHostMessage(HostMessage eventData)
        {
            switch (eventData.Type)
            {
                case "session.started":
                    break;
                case "error":
                    MessageBox.Show($"Error: {eventData.Payload}", "Assistant Error");
                    break;
            }
        }

        private sealed class HostMessage
        {
            public string Type { get; set; } = string.Empty;
            public string Payload { get; set; } = string.Empty;
        }
    }
}
