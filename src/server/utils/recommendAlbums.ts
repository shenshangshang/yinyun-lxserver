import { httpFetch } from '../../modules/utils/request'

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

/**
 * 获取 QQ 音乐专辑封面 URL
 */
const getPicUrl = (mid: string) => mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg?max_age=2592000` : ''

/**
 * 获取推荐专辑列表
 * @param type 推荐类型: recent, newest, random, frequent
 * @param size 获取数量
 */
// [fork] 热门专辑：热歌榜(topid 26)歌曲按专辑去重聚合
const fetchHotAlbums = async (size: number = 30, offset: number = 0) => {
    const payload: any = {
        comm: { ct: 24, cv: 0 },
        req: {
            module: 'musicToplist.ToplistInfoServer',
            method: 'GetDetail',
            param: { topid: 26, offset: 0, num: 100, period: '' },
        },
    }
    const url = new URL(MUSICU_URL)
    url.searchParams.set('format', 'json')
    url.searchParams.set('data', JSON.stringify(payload))
    const { body } = await (httpFetch(url.toString()) as any).promise
    const songs: any[] = body?.req?.data?.data?.song || []
    const seen = new Map<string, any>()
    for (const s of songs) {
        if (!s.albumMid || seen.has(s.albumMid)) continue
        seen.set(s.albumMid, {
            id: `alb_tx_${s.albumMid}`,
            name: s.albumName || s.title,
            title: s.albumName || s.title,
            album: s.albumName || s.title,
            artist: s.singerName || '未知歌手',
            albumArtist: s.singerName || '未知歌手',
            artistId: 'artist_tx_hot',
            songCount: 1,
            isDir: true, span: 0, year: 0, genre: '',
            coverArt: s.cover || '',
        })
    }
    return Array.from(seen.values()).slice(offset, offset + size)
}

export const fetchRecommendedAlbums = async (type: string, size: number = 20, offset: number = 0) => {
    // [fork] newest 按 recent（最新上架）处理；random 改为热门专辑（热歌榜聚合）
    let t: string = type
    if (t === 'newest') t = 'recent'
    if (t === 'random') {
        try {
            const hot = await fetchHotAlbums(size, offset)
            if (hot.length > 0) return hot
        } catch (e: any) {
            console.error('[recommendAlbums] fetchHotAlbums failed:', e.message)
        }
    }
    let payload: any = {
        comm: { ct: 24, cv: 0 }
    }

    if (t === 'recent') {
        // [fork 最新上架] 只取国内：area 1=内地 2=港台，各取15，支持 offset 分页
        for (const i of [1, 2]) {
            payload[`area_${i}`] = {
                module: 'newalbum.NewAlbumServer',
                method: 'get_new_album_info',
                param: { area: i, start: offset, num: 15 },
            }
        }
    } else {
        return []
    }

    try {
        const url = new URL(MUSICU_URL)
        url.searchParams.set('format', 'json')
        url.searchParams.set('data', JSON.stringify(payload))

        const { body } = await (httpFetch(url.toString()) as any).promise

        let rawList: any[] = []
        // [fork] 提取组合结果 (area_1 到 area_2)
        for (const i of [1, 2]) {
            const key = `area_${i}`
            if (body[key]?.data?.albums) {
                rawList.push(...body[key].data.albums)
            }
        }

        // 如果没有多区域数据(兼容旧逻辑或降级情况)
        if (rawList.length === 0) {
            if (body.new_album) {
                rawList = body.new_album.data?.albums || []
            } else if (body.rank) {
                rawList = body.rank.data?.list || []
            }
        }

        // 针对 random 类型进行打乱并截取 30 条
        if (type === 'random') {
            rawList.sort(() => Math.random() - 0.5)
            rawList = rawList.slice(0, 30)
        } else if (type === 'recent') {
            // recent 也限制在 30 条(5*6)
            rawList = rawList.slice(0, 30)
        }

        return rawList.map(item => {
            const mid = item.mid || item.album_mid
            const name = item.name || item.album_name
            const artist = (item.singers || []).map((s: any) => s.name).join('、') || item.singer_name || '未知歌手'
            return {
                id: `alb_tx_${mid}`,
                name: name,
                title: name,
                album: name,
                artist: artist,
                artistId: `artist_${artist}`,
                isDir: true,
                coverArt: getPicUrl(mid),
                songCount: 10,
                duration: 3000,
                created: new Date().toISOString(),
                playCount: 0
            }
        })
    } catch (e) {
        console.error('[RecommendAlbums] Fetch error:', e)
        return []
    }
}
