using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace CodexSkinLauncher.Windows;

internal static class CodexLocator
{
    public static async Task<string> FindAsync(CancellationToken cancellationToken)
    {
        var overridePath = Environment.GetEnvironmentVariable("CODEX_APP_PATH");
        if (IsExecutable(overridePath)) return Path.GetFullPath(overridePath!);

        foreach (var candidate in ConventionalPaths())
        {
            if (IsExecutable(candidate)) return candidate;
        }

        var packageLocation = await FindPackageLocationAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(packageLocation))
        {
            var executable = FindExecutableFromManifest(packageLocation);
            if (IsExecutable(executable)) return executable!;

            executable = FindLikelyExecutable(packageLocation);
            if (IsExecutable(executable)) return executable!;
        }

        throw new FileNotFoundException(
            "没有找到 Windows 版 Codex。请先从 Microsoft Store 安装 OpenAI Codex；也可以用 CODEX_APP_PATH 指定 Codex.exe。"
        );
    }

    private static IEnumerable<string> ConventionalPaths()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

        return new[]
        {
            Path.Combine(local, "Programs", "Codex", "Codex.exe"),
            Path.Combine(local, "Programs", "ChatGPT", "ChatGPT.exe"),
            Path.Combine(local, "OpenAI", "Codex", "Codex.exe"),
            Path.Combine(local, "OpenAI", "ChatGPT", "ChatGPT.exe"),
            Path.Combine(programFiles, "Codex", "Codex.exe"),
            Path.Combine(programFiles, "ChatGPT", "ChatGPT.exe"),
            Path.Combine(programFilesX86, "Codex", "Codex.exe"),
            Path.Combine(programFilesX86, "ChatGPT", "ChatGPT.exe")
        };
    }

    private static async Task<string> FindPackageLocationAsync(CancellationToken cancellationToken)
    {
        const string command = "$p = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1; if ($p) { $p.InstallLocation }";
        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-NonInteractive");
        startInfo.ArgumentList.Add("-ExecutionPolicy");
        startInfo.ArgumentList.Add("Bypass");
        startInfo.ArgumentList.Add("-Command");
        startInfo.ArgumentList.Add(command);

        using var process = Process.Start(startInfo);
        if (process is null) return "";

        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        if (process.ExitCode != 0) return "";
        return (await outputTask).Trim();
    }

    private static string? FindExecutableFromManifest(string packageLocation)
    {
        try
        {
            var manifestPath = Path.Combine(packageLocation, "AppxManifest.xml");
            if (!File.Exists(manifestPath)) return null;
            var document = XDocument.Load(manifestPath);
            var application = document.Descendants().FirstOrDefault(node => node.Name.LocalName == "Application");
            var relativePath = application?.Attributes().FirstOrDefault(attribute => attribute.Name.LocalName == "Executable")?.Value;
            return string.IsNullOrWhiteSpace(relativePath)
                ? null
                : Path.GetFullPath(Path.Combine(packageLocation, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        }
        catch
        {
            return null;
        }
    }

    private static string? FindLikelyExecutable(string packageLocation)
    {
        try
        {
            return Directory.EnumerateFiles(packageLocation, "*.exe", SearchOption.AllDirectories)
                .Where(path => !path.Contains("crashpad", StringComparison.OrdinalIgnoreCase))
                .Where(path => !path.Contains("uninstall", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(path => Path.GetFileName(path).Contains("Codex", StringComparison.OrdinalIgnoreCase))
                .ThenBy(path => path.Count(character => character == Path.DirectorySeparatorChar))
                .FirstOrDefault();
        }
        catch
        {
            return null;
        }
    }

    private static bool IsExecutable(string? path) => !string.IsNullOrWhiteSpace(path) && File.Exists(path);
}
