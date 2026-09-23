import AppKit
import Foundation

// Bundle identity only. No accessibility permission, editor text or window titles.
let args = CommandLine.arguments
guard args.count == 3, let endpoint = URL(string: args[1]),
      let token = try? String(contentsOfFile: args[2], encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
else { exit(1) }
func report() {
    let app = NSWorkspace.shared.frontmostApplication
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.timeoutInterval = 2
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["app": app?.bundleIdentifier ?? "unknown"])
    URLSession.shared.dataTask(with: request).resume()
}
let observer = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { _ in report() }
let timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in report() }
report()
RunLoop.main.run()
