using DotNetEnv;
using System.IO;

namespace CortiAssistantApp.Services
{
    internal sealed class CortiSettings
    {
        public string EnvironmentName { get; }
        public string TenantName { get; }
        public string ClientId { get; }
        public string UserEmail { get; }
        public string UserPassword { get; }

        private CortiSettings(
            string environmentName,
            string tenantName,
            string clientId,
            string userEmail,
            string userPassword
        )
        {
            EnvironmentName = environmentName;
            TenantName = tenantName;
            ClientId = clientId;
            UserEmail = userEmail;
            UserPassword = userPassword;
        }

        public static CortiSettings LoadFromProjectEnv()
        {
            var envPath = FindEnvFile();
            if (envPath is null)
            {
                throw new InvalidOperationException(
                    "Missing .env file in the project directory. Copy .env.example to .env in the project root and fill in the Corti settings."
                );
            }

            Env.Load(envPath);

            var missingKeys = new List<string>();
            var environmentName = ReadRequired("CORTI_ENVIRONMENT", missingKeys);
            var tenantName = ReadRequired("CORTI_TENANT_NAME", missingKeys);
            var clientId = ReadRequired("CORTI_CLIENT_ID", missingKeys);
            var userEmail = ReadRequired("CORTI_USER_EMAIL", missingKeys);
            var userPassword = ReadRequired("CORTI_USER_PASSWORD", missingKeys);

            if (missingKeys.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Missing required .env keys: {string.Join(", ", missingKeys.OrderBy(key => key))}"
                );
            }

            return new CortiSettings(
                environmentName,
                tenantName,
                clientId,
                userEmail,
                userPassword
            );
        }

        private static string ReadRequired(string key, ICollection<string> missingKeys)
        {
            var value = Environment.GetEnvironmentVariable(key);
            if (string.IsNullOrWhiteSpace(value))
            {
                missingKeys.Add(key);
                return string.Empty;
            }

            return value;
        }

        private static string? FindEnvFile()
        {
            var candidateRoots = new[]
            {
                Directory.GetCurrentDirectory(),
                AppContext.BaseDirectory
            }
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (var root in candidateRoots)
            {
                var current = new DirectoryInfo(root);
                while (current is not null)
                {
                    var envPath = Path.Combine(current.FullName, ".env");
                    if (File.Exists(envPath))
                    {
                        return envPath;
                    }

                    current = current.Parent;
                }
            }

            return null;
        }
    }
}
