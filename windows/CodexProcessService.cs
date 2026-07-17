using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CodexSkinLauncher.Windows;

internal static class CodexProcessService
{
    public static async Task<string> RestartAsync(int port, CancellationToken cancellationToken)
    {
        var executable = await CodexLocator.FindAsync(cancellationToken);
        await StopExistingInstancesAsync(executable, cancellationToken);

        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(executable) ?? ""
        };
        startInfo.ArgumentList.Add("--remote-debugging-address=127.0.0.1");
        startInfo.ArgumentList.Add($"--remote-debugging-port={port}");

        try
        {
            Process.Start(startInfo);
        }
        catch (Exception error)
        {
            throw new InvalidOperationException(
                $"Codex 启动失败：{error.Message}。如果安装位置发生变化，可用 CODEX_APP_PATH 指定 Codex.exe。",
                error
            );
        }

        return executable;
    }

    private static async Task StopExistingInstancesAsync(string executable, CancellationToken cancellationToken)
    {
        var processName = Path.GetFileNameWithoutExtension(executable);
        foreach (var process in Process.GetProcessesByName(processName))
        {
            using (process)
            {
                if (!MatchesExecutable(process, executable)) continue;
                try
                {
                    process.CloseMainWindow();
                }
                catch
                {
                    // 某些子进程没有窗口。
                }
            }
        }

        await Task.Delay(900, cancellationToken);

        foreach (var process in Process.GetProcessesByName(processName))
        {
            using (process)
            {
                if (!MatchesExecutable(process, executable)) continue;
                try
                {
                    process.Kill(entireProcessTree: true);
                    await process.WaitForExitAsync(cancellationToken);
                }
                catch
                {
                    // 已退出或当前账户无权结束的进程由后续启动错误提示处理。
                }
            }
        }
    }

    private static bool MatchesExecutable(Process process, string executable)
    {
        try
        {
            var processPath = process.MainModule?.FileName;
            return !string.IsNullOrWhiteSpace(processPath)
                && string.Equals(Path.GetFullPath(processPath), Path.GetFullPath(executable), StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }
}
