import CoreBluetooth
import ExpoModulesCore

/// Moves proximity radio (ARCHITECTURE.md 8.2). Advertises one 128-bit service
/// UUID ("4D4F5645-..." = MOVE + a server token) and scans for others carrying
/// the same prefix. Foreground only, which iOS requires for custom UUIDs anyway.
public class MovesBleModule: Module {
  private var radio: MovesRadio?

  public func definition() -> ModuleDefinition {
    Name("MovesBle")
    Events("onSighting", "onState")

    Function("isSupported") { () -> Bool in true }

    Function("start") { (uuid: String) in
      DispatchQueue.main.async {
        if self.radio == nil {
          self.radio = MovesRadio(
            onSighting: { [weak self] id, rssi in
              self?.sendEvent("onSighting", ["uuid": id, "rssi": rssi])
            },
            onState: { [weak self] state in
              self?.sendEvent("onState", ["state": state])
            })
        }
        self.radio?.start(uuid: uuid)
      }
    }

    Function("stop") {
      DispatchQueue.main.async { self.radio?.stop() }
    }
  }
}

final class MovesRadio: NSObject, CBCentralManagerDelegate, CBPeripheralManagerDelegate {
  static let prefix = "4D4F5645"

  private var central: CBCentralManager?
  private var peripheral: CBPeripheralManager?
  private var uuid: String?
  private var running = false
  private let onSighting: (String, Int) -> Void
  private let onState: (String) -> Void

  init(onSighting: @escaping (String, Int) -> Void, onState: @escaping (String) -> Void) {
    self.onSighting = onSighting
    self.onState = onState
    super.init()
  }

  func start(uuid: String) {
    self.uuid = uuid.uppercased()
    running = true
    if central == nil { central = CBCentralManager(delegate: self, queue: nil) }
    if peripheral == nil { peripheral = CBPeripheralManager(delegate: self, queue: nil) }
    advertise()
    scan()
  }

  func stop() {
    running = false
    central?.stopScan()
    peripheral?.stopAdvertising()
  }

  private func advertise() {
    guard running, let p = peripheral, p.state == .poweredOn, let id = uuid else { return }
    p.stopAdvertising()
    p.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [CBUUID(string: id)]])
  }

  private func scan() {
    guard running, let c = central, c.state == .poweredOn else { return }
    c.scanForPeripherals(
      withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }

  private static func describe(_ s: CBManagerState) -> String {
    switch s {
    case .poweredOn: return "on"
    case .poweredOff: return "off"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    default: return "unknown"
    }
  }

  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    onState(Self.describe(c.state))
    scan()
  }

  func peripheralManagerDidUpdateState(_ p: CBPeripheralManager) {
    advertise()
  }

  func centralManager(
    _ c: CBCentralManager, didDiscover _: CBPeripheral,
    advertisementData: [String: Any], rssi RSSI: NSNumber
  ) {
    let rssi = RSSI.intValue
    guard rssi < 0 else { return }  // 127 means unavailable
    var ids = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
    ids += advertisementData[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID] ?? []
    for id in ids {
      let s = id.uuidString.uppercased()
      if s.hasPrefix(Self.prefix) && s != uuid { onSighting(s, rssi) }
    }
  }
}
