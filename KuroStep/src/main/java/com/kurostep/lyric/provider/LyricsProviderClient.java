package com.kurostep.lyric.provider;

import com.kurostep.track.domain.Track;

public interface LyricsProviderClient {

    LyricsProviderResult fetch(Track track);
}
