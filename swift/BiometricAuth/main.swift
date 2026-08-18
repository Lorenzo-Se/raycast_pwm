import Foundation
import LocalAuthentication
import Security

private let keychainLabel = "Raycast PWM"

private struct BiometricAuthError: Error, LocalizedError {
  let message: String
  var errorDescription: String? { message }

  init(_ message: String) {
    self.message = message
  }
}

@main
enum BiometricAuth {
  static func main() {
    do {
      try run()
    } catch {
      emit(ok: false, result: nil, error: error.localizedDescription)
      exit(1)
    }
  }
}

private func run() throws {
  let request = try readRequest()
  let op = stringValue(request["op"]) ?? ""

  switch op {
  case "isAvailable":
    emit(ok: true, result: isBiometricAvailable(), error: nil)
  case "has":
    emit(
      ok: true,
      result: hasStoredCredential(service: try require(request, "service"), account: try require(request, "account")),
      error: nil
    )
  case "store":
    try storeCredential(service: require(request, "service"), account: require(request, "account"), secret: require(request, "secret"))
    emit(ok: true, result: true, error: nil)
  case "retrieve":
    let secret = try retrieveCredential(service: require(request, "service"), account: require(request, "account"))
    emit(ok: true, result: secret, error: nil)
  case "delete":
    try removeCredential(service: require(request, "service"), account: require(request, "account"))
    emit(ok: true, result: true, error: nil)
  default:
    throw BiometricAuthError("Unknown operation")
  }
}

private func readRequest() throws -> [String: Any] {
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard !data.isEmpty else {
    throw BiometricAuthError("Empty request")
  }
  guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    throw BiometricAuthError("Invalid request")
  }
  return object
}

private func require(_ request: [String: Any], _ key: String) throws -> String {
  guard let value = stringValue(request[key]), !value.isEmpty else {
    throw BiometricAuthError("Missing \(key)")
  }
  return value
}

private func stringValue(_ value: Any?) -> String? {
  value as? String
}

private func emit(ok: Bool, result: Any?, error: String?) {
  var payload: [String: Any] = ["ok": ok]
  if let result {
    payload["result"] = result
  }
  if let error {
    payload["error"] = error
  }
  guard let data = try? JSONSerialization.data(withJSONObject: payload),
        let line = String(data: data, encoding: .utf8)
  else {
    FileHandle.standardError.write(Data("Failed to encode response\n".utf8))
    return
  }
  FileHandle.standardOutput.write(Data("\(line)\n".utf8))
}

private func isBiometricAvailable() -> Bool {
  let context = LAContext()
  var error: NSError?
  return context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
}

private func hasStoredCredential(service: String, account: String) -> Bool {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecReturnAttributes as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
  ]

  var result: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &result)
  return status == errSecSuccess
}

private func storeCredential(service: String, account: String, secret: String) throws {
  try removeCredential(service: service, account: account)

  guard let data = secret.data(using: .utf8) else {
    throw BiometricAuthError("Failed to encode keychain secret")
  }

  // Access-Control + userPresence needs a signed app entitlement (errSecMissingEntitlement / -34018
  // on an unsigned swiftc helper). Store device-only and require biometrics on retrieve instead.
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecAttrLabel as String: keychainLabel,
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    kSecValueData as String: data,
  ]

  let status = SecItemAdd(query as CFDictionary, nil)
  guard status == errSecSuccess else {
    throw BiometricAuthError("Failed to store keychain item (\(status))")
  }
}

private func retrieveCredential(service: String, account: String) throws -> String {
  try authenticateDeviceOwner()

  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecReturnData as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
  ]

  var result: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &result)

  if status == errSecItemNotFound {
    throw BiometricAuthError("notFound")
  }
  if status == errSecUserCanceled || status == errSecAuthFailed {
    throw BiometricAuthError("canceled")
  }
  guard status == errSecSuccess, let data = result as? Data, let secret = String(data: data, encoding: .utf8) else {
    throw BiometricAuthError("Failed to read keychain item (\(status))")
  }
  return secret
}

private func authenticateDeviceOwner() throws {
  let context = LAContext()
  var laError: NSError?
  guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &laError) else {
    throw BiometricAuthError(laError?.localizedDescription ?? "Device owner authentication is unavailable")
  }

  let semaphore = DispatchSemaphore(value: 0)
  var success = false
  var evaluateError: Error?
  context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock your password manager") { ok, error in
    success = ok
    evaluateError = error
    semaphore.signal()
  }
  semaphore.wait()

  if let evaluateError {
    let nsError = evaluateError as NSError
    if nsError.code == LAError.userCancel.rawValue || nsError.code == LAError.systemCancel.rawValue {
      throw BiometricAuthError("canceled")
    }
    throw BiometricAuthError(evaluateError.localizedDescription)
  }

  guard success else {
    throw BiometricAuthError("canceled")
  }
}

private func removeCredential(service: String, account: String) throws {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
  ]

  let status = SecItemDelete(query as CFDictionary)
  if status != errSecSuccess && status != errSecItemNotFound {
    throw BiometricAuthError("Failed to delete keychain item (\(status))")
  }
}
