export function getIpfsPathByPackageInfo(pakInfo) {
	return `/ipfs/${pakInfo.ipfs}/${pakInfo.name}`;
}
