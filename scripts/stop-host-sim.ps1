# Stops any running collab-host-sim node process.
$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
$stopped = 0
foreach ($p in $procs) {
    if ($p.CommandLine -like '*collab-host-sim*') {
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
            Write-Host ("stopped host-sim pid " + $p.ProcessId)
            $stopped++
        } catch {
            Write-Host ("could not stop pid " + $p.ProcessId)
        }
    }
}
if ($stopped -eq 0) { Write-Host 'no host-sim process was running' }
