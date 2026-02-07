import random
import string
import time


def hash_int(x: int):
    x = ((x >> 16) ^ x) * 0x45D9F3B
    x = ((x >> 16) ^ x) * 0x45D9F3B
    x = (x >> 16) ^ x
    return x


def generate_mock_pod(index: int, i: int, j: int):
    names = [
        "agent-cooper",
        "black-lodge",
        "bob",
        "bobby-briggs",
        "laura-palmer",
        "leland-palmer",
        "log-lady",
        "sheriff-truman",
    ]
    labels = {"env": ["prod", "dev"], "owner": ["x-wing", "iris"]}
    pod_phases = ["Pending", "Running", "Running", "Failed"]

    pod_labels = {}
    for li, k in enumerate(labels):
        v = labels[k]
        label_choice = hash_int((index + 1) * (i + 1) * (j + 1) * (li + 1)) % (
            len(v) + 1
        )
        if label_choice != 0:
            pod_labels[k] = v[label_choice - 1]

    phase = pod_phases[hash_int((index + 1) * (i + 1) * (j + 1)) % len(pod_phases)]
    containers = []
    for _ in range(1 + j % 2):
        # generate "more real data"
        requests_cpu = random.randint(10, 50)
        requests_memory = random.randint(64, 256)
        # with max, we defend ourselves against negative cpu/memory ;)
        usage_cpu = max(requests_cpu + random.randint(-30, 30), 1)
        usage_memory = max(requests_memory + random.randint(-64, 128), 1)
        container = {
            "name": "myapp",
            "image": "foo/bar/{}".format(j),
            "resources": {
                "requests": {
                    "cpu": f"{requests_cpu}m",
                    "memory": f"{requests_memory}Mi",
                },
                "limits": {},
                "usage": {"cpu": f"{usage_cpu}m", "memory": f"{usage_memory}Mi"},
            },
            "ready": True,
            "state": {"running": {}},
        }
        if phase == "Running":
            if j % 13 == 0:
                container.update(
                    **{
                        "ready": False,
                        "state": {"waiting": {"reason": "CrashLoopBackOff"}},
                    }
                )
            elif j % 7 == 0:
                container.update(
                    **{"ready": False, "state": {"running": {}}, "restartCount": 3}
                )
        elif phase == "Failed":
            del container["state"]
            del container["ready"]
        containers.append(container)
    pod = {
        "name": "{}-{}-{}".format(
            names[hash_int((i + 1) * (j + 1)) % len(names)], i, j
        ),
        "namespace": "kube-system" if j < 3 else "default",
        "labels": pod_labels,
        "phase": phase,
        "containers": containers,
    }
    if phase == "Running" and j % 17 == 0:
        pod["deleted"] = 123

    return pod


def query_mock_cluster(cluster):
    """Generate deterministic (no randomness!) mock data."""
    index = int(cluster.id.split("-")[-1])
    nodes = {}

    availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

    # Node layout per pool:
    #   Masters: 3 nodes, 1 per AZ (indices 0-2)
    #   Infra:   3-5 nodes, at least 1 per AZ (indices 3-7)
    #   Workers: 3-7 nodes per AZ (indices 8+)
    #
    # Use cluster index to vary infra/worker counts across mock clusters
    infra_per_az = [1, 1, 1]  # base: 1 per AZ = 3 total
    if index >= 1:
        infra_per_az[0] = 2   # 4 total for cluster 1+
    if index >= 2:
        infra_per_az[1] = 2   # 5 total for cluster 2+

    worker_per_az = [
        3 + hash_int((index + 1) * 101) % 5,  # 3-7 for AZ a
        3 + hash_int((index + 1) * 202) % 5,  # 3-7 for AZ b
        3 + hash_int((index + 1) * 303) % 5,  # 3-7 for AZ c
    ]

    # Build node list: (role, az_index)
    node_specs = []

    # Masters: 1 per AZ
    for az_i in range(3):
        node_specs.append(("master", az_i))

    # Infra: variable per AZ
    for az_i in range(3):
        for _ in range(infra_per_az[az_i]):
            node_specs.append(("infra", az_i))

    # Workers: 3-7 per AZ
    for az_i in range(3):
        for _ in range(worker_per_az[az_i]):
            node_specs.append(("worker", az_i))

    for i, (role, az_i) in enumerate(node_specs):
        # add/remove one worker node every 13 seconds for dynamism
        if role == "worker" and i == len(node_specs) - 1 and int(time.time() / 13) % 2 == 0:
            continue

        labels = {}
        labels["topology.kubernetes.io/zone"] = availability_zones[az_i]

        if role == "master":
            if index == 0:
                labels["node-role.kubernetes.io/master"] = ""
                labels["node-role.kubernetes.io/control-plane"] = ""
            elif index == 1:
                labels["node-role.kubernetes.io/control-plane"] = ""
            else:
                labels["kubernetes.io/role"] = "master"
        elif role == "infra":
            labels["node-role.kubernetes.io/infra"] = ""
        else:
            labels["node-role.kubernetes.io/worker"] = ""

        pods = {}
        for j in range(hash_int((index + 1) * (i + 1)) % 32):
            # add/remove some pods every 7 seconds
            if j % 17 == 0 and int(time.time() / 7) % 2 == 0:
                pass
            else:
                pod = generate_mock_pod(index, i, j)
                pods["{}/{}".format(pod["namespace"], pod["name"])] = pod

        # use data from containers (usage)
        usage_cpu = 0
        usage_memory = 0
        for p in pods.values():
            for c in p["containers"]:
                usage_cpu += int(c["resources"]["usage"]["cpu"].split("m")[0])
                usage_memory += int(c["resources"]["usage"]["memory"].split("Mi")[0])

        # generate longer name for a node
        suffix = "".join(
            [random.choice(string.ascii_letters) for n in range(random.randint(1, 20))]
        )

        node = {
            "name": f"node-{i}-{suffix}",
            "labels": labels,
            "status": {
                "capacity": {"cpu": "8", "memory": "64Gi", "pods": "110"},
                "allocatable": {"cpu": "7800m", "memory": "62Gi"},
            },
            "pods": pods,
            "usage": {"cpu": f"{usage_cpu}m", "memory": f"{usage_memory}Mi"},
        }
        nodes[node["name"]] = node

    pod = generate_mock_pod(index, 11, index)
    unassigned_pods = {"{}/{}".format(pod["namespace"], pod["name"]): pod}
    return {
        "id": "mock-cluster-{}".format(index),
        "api_server_url": "https://kube-{}.example.org".format(index),
        "nodes": nodes,
        "unassigned_pods": unassigned_pods,
    }
