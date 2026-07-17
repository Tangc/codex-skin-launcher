using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace CodexSkinLauncher.Windows;

internal sealed class SkinInjector : IAsyncDisposable
{
    private readonly int _port;
    private readonly Action<string, string> _statusChanged;
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromMilliseconds(1800) };
    private readonly Dictionary<string, SkinSession> _sessions = new();
    private readonly object _configLock = new();
    private readonly CancellationTokenSource _cancellation = new();
    private SkinConfig _config;
    private string _css;
    private string _cssHash;
    private string _layoutExpression;
    private string _layoutHash;
    private Task? _loopTask;
    private string _lastStatus = "";

    public SkinInjector(int port, SkinConfig config, Action<string, string> statusChanged)
    {
        _port = port;
        _config = config.Copy();
        _css = SkinCss.Build(_config);
        _cssHash = HashText(_css);
        (_layoutExpression, _layoutHash) = BuildLayoutExpression(_config);
        _statusChanged = statusChanged;
    }

    public void Start()
    {
        _loopTask ??= Task.Run(() => RunAsync(_cancellation.Token));
    }

    public void UpdateConfig(SkinConfig config)
    {
        var copy = config.Copy();
        var css = SkinCss.Build(copy);
        var layout = BuildLayoutExpression(copy);
        lock (_configLock)
        {
            _config = copy;
            _css = css;
            _cssHash = HashText(css);
            _layoutExpression = layout.Expression;
            _layoutHash = layout.Hash;
        }
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                Report("error", $"皮肤注入失败：{error.Message}");
            }

            try
            {
                await Task.Delay(850, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        List<CdpTarget>? targets;
        try
        {
            targets = await _httpClient.GetFromJsonAsync<List<CdpTarget>>(
                $"http://127.0.0.1:{_port}/json/list",
                cancellationToken
            );
        }
        catch
        {
            Report("waiting", "等待 Codex 启动…");
            return;
        }

        var pages = (targets ?? [])
            .Where(target => target.Type == "page" && !string.IsNullOrWhiteSpace(target.WebSocketDebuggerUrl))
            .ToList();
        var activeIds = pages.Select(target => target.Id).ToHashSet(StringComparer.Ordinal);

        foreach (var staleId in _sessions.Keys.Where(id => !activeIds.Contains(id)).ToList())
        {
            await _sessions[staleId].DisposeAsync();
            _sessions.Remove(staleId);
        }

        SkinConfig config;
        string css;
        string hash;
        string layoutExpression;
        string layoutHash;
        lock (_configLock)
        {
            config = _config.Copy();
            css = _css;
            hash = _cssHash;
            layoutExpression = _layoutExpression;
            layoutHash = _layoutHash;
        }
        string? lastError = null;

        foreach (var target in pages)
        {
            if (!_sessions.TryGetValue(target.Id, out var session) || session.Url != target.WebSocketDebuggerUrl)
            {
                if (session is not null) await session.DisposeAsync();
                session = new SkinSession(target.WebSocketDebuggerUrl);
                _sessions[target.Id] = session;
            }

            try
            {
                await session.ApplyAsync(css, hash, layoutExpression, layoutHash, cancellationToken);
            }
            catch (Exception error)
            {
                lastError = error.Message;
                await session.DisposeAsync();
                _sessions.Remove(target.Id);
            }
        }

        if (pages.Count == 0)
        {
            Report("waiting", "等待 Codex 页面…");
        }
        else if (_sessions.Count == 0 && lastError is not null)
        {
            Report("error", $"皮肤注入失败：{lastError}");
        }
        else
        {
            var layoutName = config.LayoutTheme switch
            {
                "wechat" => "微信式",
                "feishu" => "飞书式",
                "qq2007" => "QQ 2007 复古式",
                _ => "原始"
            };
            var layoutSuffix = config.Enabled && config.LayoutTheme != "original" ? $"，{layoutName}布局已启用" : "";
            Report("connected", config.Enabled
                ? $"皮肤已应用到 {_sessions.Count} 个窗口{layoutSuffix}"
                : "已恢复 Codex 原始外观");
        }
    }

    private void Report(string state, string message)
    {
        var signature = $"{state}:{message}";
        if (signature == _lastStatus) return;
        _lastStatus = signature;
        _statusChanged(state, message);
    }

    private static string HashText(string text) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    private static (string Expression, string Hash) BuildLayoutExpression(SkinConfig config)
    {
        var payload = JsonSerializer.Serialize(new
        {
            enabled = config.Enabled,
            layoutTheme = config.LayoutTheme,
            accentColor = config.AccentColor,
            backgroundColor = config.BackgroundColor,
            foregroundColor = config.ForegroundColor
        });
        return ($"{LayoutThemeScript.Source}\n;globalThis.__codexSkinLayoutEngine.apply({payload});", HashText(payload));
    }

    public async ValueTask DisposeAsync()
    {
        _cancellation.Cancel();
        if (_loopTask is not null)
        {
            try { await _loopTask; } catch (OperationCanceledException) { }
        }
        foreach (var session in _sessions.Values)
        {
            await session.DisposeAsync();
        }
        _sessions.Clear();
        _httpClient.Dispose();
        _cancellation.Dispose();
    }

    private sealed class CdpTarget
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("type")]
        public string Type { get; set; } = "";

        [JsonPropertyName("webSocketDebuggerUrl")]
        public string WebSocketDebuggerUrl { get; set; } = "";
    }
}

internal sealed class SkinSession : IAsyncDisposable
{
    private readonly CdpConnection _connection;
    private string _styleSheetId = "";
    private string _lastHash = "";
    private string _lastLayoutHash = "";
    private DateTime _lastApplied = DateTime.MinValue;

    public SkinSession(string url)
    {
        Url = url;
        _connection = new CdpConnection(url);
    }

    public string Url { get; }

    public async Task ApplyAsync(string css, string hash, string layoutExpression, string layoutHash, CancellationToken cancellationToken)
    {
        if (hash == _lastHash && layoutHash == _lastLayoutHash && DateTime.UtcNow - _lastApplied < TimeSpan.FromSeconds(3.5)) return;
        if (string.IsNullOrWhiteSpace(_styleSheetId)) await InitializeAsync(cancellationToken);

        try
        {
            await SetStyleSheetTextAsync(css, cancellationToken);
        }
        catch
        {
            _styleSheetId = "";
            await CreateStyleSheetAsync(cancellationToken);
            await SetStyleSheetTextAsync(css, cancellationToken);
        }

        var layoutResult = await _connection.RequestAsync(
            "Runtime.evaluate",
            new Dictionary<string, object?>
            {
                ["expression"] = layoutExpression,
                ["returnByValue"] = true,
                ["awaitPromise"] = true
            },
            cancellationToken
        );
        if (layoutResult.TryGetProperty("exceptionDetails", out var exceptionDetails))
        {
            var message = exceptionDetails.TryGetProperty("text", out var text) ? text.GetString() : "布局主题脚本执行失败";
            if (exceptionDetails.TryGetProperty("exception", out var exception) &&
                exception.TryGetProperty("description", out var description))
            {
                message = description.GetString() ?? message;
            }
            throw new InvalidOperationException(message);
        }

        _lastHash = hash;
        _lastLayoutHash = layoutHash;
        _lastApplied = DateTime.UtcNow;
    }

    private async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await _connection.ConnectAsync(cancellationToken);
        await _connection.RequestAsync("Page.enable", null, cancellationToken);
        await _connection.RequestAsync("DOM.enable", null, cancellationToken);
        await _connection.RequestAsync("CSS.enable", null, cancellationToken);
        await _connection.RequestAsync("Runtime.enable", null, cancellationToken);
        await CreateStyleSheetAsync(cancellationToken);
    }

    private async Task CreateStyleSheetAsync(CancellationToken cancellationToken)
    {
        var frameTree = await _connection.RequestAsync("Page.getFrameTree", null, cancellationToken);
        var frameId = frameTree.GetProperty("frameTree").GetProperty("frame").GetProperty("id").GetString();
        if (string.IsNullOrWhiteSpace(frameId)) throw new InvalidOperationException("未找到 Codex 页面 Frame");

        var result = await _connection.RequestAsync(
            "CSS.createStyleSheet",
            new Dictionary<string, object?> { ["frameId"] = frameId },
            cancellationToken
        );
        _styleSheetId = result.GetProperty("styleSheetId").GetString() ?? "";
        if (string.IsNullOrWhiteSpace(_styleSheetId)) throw new InvalidOperationException("无法创建皮肤样式表");
    }

    private Task<JsonElement> SetStyleSheetTextAsync(string css, CancellationToken cancellationToken) =>
        _connection.RequestAsync(
            "CSS.setStyleSheetText",
            new Dictionary<string, object?> { ["styleSheetId"] = _styleSheetId, ["text"] = css },
            cancellationToken
        );

    public ValueTask DisposeAsync() => _connection.DisposeAsync();
}

internal static class LayoutThemeScript
{
    public static string Source { get; } = Load();

    private static string Load()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexSkinLauncher.LayoutThemes.js")
            ?? throw new InvalidOperationException("布局主题资源缺失");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}

internal sealed class CdpConnection : IAsyncDisposable
{
    private readonly Uri _uri;
    private readonly ClientWebSocket _socket = new();
    private readonly byte[] _buffer = new byte[32 * 1024];
    private int _nextId = 1;

    public CdpConnection(string url) => _uri = new Uri(url);

    public async Task ConnectAsync(CancellationToken cancellationToken)
    {
        if (_socket.State == WebSocketState.Open) return;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(4));
        await _socket.ConnectAsync(_uri, timeout.Token);
    }

    public async Task<JsonElement> RequestAsync(
        string method,
        Dictionary<string, object?>? parameters,
        CancellationToken cancellationToken)
    {
        if (_socket.State != WebSocketState.Open) await ConnectAsync(cancellationToken);
        var id = _nextId++;
        var payload = JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object?>
        {
            ["id"] = id,
            ["method"] = method,
            ["params"] = parameters ?? new Dictionary<string, object?>()
        });

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        await _socket.SendAsync(payload, WebSocketMessageType.Text, true, timeout.Token);

        while (true)
        {
            using var message = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await _socket.ReceiveAsync(_buffer, timeout.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                    throw new WebSocketException("Codex 调试连接已关闭");
                message.Write(_buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            using var document = JsonDocument.Parse(message.ToArray());
            var root = document.RootElement;
            if (!root.TryGetProperty("id", out var responseId) || responseId.GetInt32() != id) continue;
            if (root.TryGetProperty("error", out var error))
            {
                var errorMessage = error.TryGetProperty("message", out var value) ? value.GetString() : "CDP 请求失败";
                throw new InvalidOperationException(errorMessage);
            }
            return root.TryGetProperty("result", out var response)
                ? response.Clone()
                : JsonDocument.Parse("{}").RootElement.Clone();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_socket.State == WebSocketState.Open)
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(400));
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "launcher closed", timeout.Token);
            }
            catch { }
        }
        _socket.Dispose();
    }
}

internal static partial class SkinCss
{
    public static string Build(SkinConfig config)
    {
        if (!config.Enabled) return "";

        var background = ValidHex(config.BackgroundColor, "#0D1117");
        var foreground = ValidHex(config.ForegroundColor, "#E8EDF5");
        var accent = ValidHex(config.AccentColor, "#7C9CFF");
        var backgroundRgb = HexToRgb(background);
        var panelOpacity = Clamp(config.PanelOpacity, 0.25, 1, 0.78);
        var underOpacity = Math.Max(0.22, panelOpacity - 0.2);
        var elevatedOpacity = Math.Min(1, panelOpacity + 0.1);
        var overlayOpacity = Clamp(config.OverlayOpacity, 0, 0.95, 0.58);
        var blur = Clamp(config.BlurRadius, 0, 30, 3);
        var brightness = Clamp(config.Brightness, 0.25, 1.5, 0.86);
        var saturation = Clamp(config.Saturation, 0, 2, 0.92);
        var fit = config.ImageFit == "contain" ? "contain" : "cover";
        var dataUrl = WallpaperDataUrl(config.BackgroundImagePath);
        var backgroundImage = string.IsNullOrWhiteSpace(dataUrl)
            ? $"linear-gradient({background}, {background})"
            : $"linear-gradient(rgb({backgroundRgb} / {Number(overlayOpacity)}), rgb({backgroundRgb} / {Number(overlayOpacity)})), url(\"{dataUrl}\")";
        var uiFont = QuoteFont(config.UiFontFamily);
        var codeFont = QuoteFont(config.CodeFontFamily);
        var fontRules = new[]
        {
            uiFont.Length > 0 ? $"--font-sans: {uiFont}, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif !important;" : "",
            uiFont.Length > 0 ? $"--vscode-font-family: {uiFont}, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif !important;" : "",
            codeFont.Length > 0 ? $"--font-mono: {codeFont}, Consolas, \"Cascadia Mono\", monospace !important;" : "",
            codeFont.Length > 0 ? $"--vscode-editor-font-family: {codeFont}, Consolas, \"Cascadia Mono\", monospace !important;" : ""
        }.Where(rule => rule.Length > 0);

        return $$"""
/* Codex Skin Launcher — generated stylesheet */
:root,
html,
html[data-codex-window-type],
body,
#root {
  --color-background-surface: rgb({{backgroundRgb}} / {{Number(panelOpacity)}}) !important;
  --color-background-surface-under: rgb({{backgroundRgb}} / {{Number(underOpacity)}}) !important;
  --color-background-elevated-primary: rgb({{backgroundRgb}} / {{Number(elevatedOpacity)}}) !important;
  --color-background-elevated-primary-opaque: rgb({{backgroundRgb}} / {{Number(elevatedOpacity)}}) !important;
  --color-background-elevated-secondary: rgb({{backgroundRgb}} / {{Number(Math.Min(1, panelOpacity + 0.04))}}) !important;
  --color-background-editor-opaque: rgb({{backgroundRgb}} / {{Number(panelOpacity)}}) !important;
  --color-token-main-surface-primary: rgb({{backgroundRgb}} / {{Number(panelOpacity)}}) !important;
  --vscode-editor-background: rgb({{backgroundRgb}} / {{Number(panelOpacity)}}) !important;
  --vscode-sideBar-background: rgb({{backgroundRgb}} / {{Number(underOpacity)}}) !important;
  --vscode-foreground: {{foreground}} !important;
  --color-text-foreground: {{foreground}} !important;
  --color-token-foreground: {{foreground}} !important;
  --color-token-text-primary: {{foreground}} !important;
  --vscode-textLink-foreground: {{accent}} !important;
  --vscode-textLink-activeForeground: {{accent}} !important;
  --vscode-focusBorder: {{accent}} !important;
  --vscode-charts-blue: {{accent}} !important;
  --color-token-text-link-foreground: {{accent}} !important;
  --color-token-text-link-active-foreground: {{accent}} !important;
  --color-token-focus-border: {{accent}} !important;
  --color-token-charts-blue: {{accent}} !important;
  {{string.Join("\n  ", fontRules)}}
}

html { background: {{background}} !important; }
body { background: transparent !important; isolation: isolate !important; }
body::before {
  content: "" !important;
  position: fixed !important;
  inset: -32px !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background-color: {{background}} !important;
  background-image: {{backgroundImage}} !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: {{fit}} !important;
  filter: blur({{Number(blur)}}px) brightness({{Number(brightness)}}) saturate({{Number(saturation)}}) !important;
  transform: scale(1.025) !important;
  transform-origin: center !important;
}
#root,
.startup-loader,
[data-codex-window-type="electron"] { background-color: transparent !important; }
.bg-token-main-surface-primary { background-color: rgb({{backgroundRgb}} / {{Number(panelOpacity)}}) !important; }
""";
    }

    private static string WallpaperDataUrl(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return "";
        var mime = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/jpeg"
        };
        return $"data:{mime};base64,{Convert.ToBase64String(File.ReadAllBytes(path))}";
    }

    private static string ValidHex(string? value, string fallback) =>
        value is not null && HexColorRegex().IsMatch(value) ? value.ToUpperInvariant() : fallback;

    private static string HexToRgb(string hex)
    {
        var value = Convert.ToInt32(hex[1..], 16);
        return $"{(value >> 16) & 255} {(value >> 8) & 255} {value & 255}";
    }

    private static double Clamp(double value, double minimum, double maximum, double fallback) =>
        double.IsFinite(value) ? Math.Clamp(value, minimum, maximum) : fallback;

    private static string QuoteFont(string? font)
    {
        if (string.IsNullOrWhiteSpace(font)) return "";
        return $"\"{font.Trim().Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
    }

    private static string Number(double value) => value.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture);

    [GeneratedRegex("^#[0-9a-fA-F]{6}$", RegexOptions.CultureInvariant)]
    private static partial Regex HexColorRegex();
}
